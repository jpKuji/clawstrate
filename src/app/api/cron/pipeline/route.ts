import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { runIngestion } from "@/lib/pipeline/ingest";
import { runEnrichment } from "@/lib/pipeline/enrich";
import { runAnalysis } from "@/lib/pipeline/analyze";
import { runAggregation } from "@/lib/pipeline/aggregate";
import { detectCoordination, detectCommunities } from "@/lib/pipeline/coordination";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { PIPELINE_STAGE_ORDER, type PipelineStageName } from "@/lib/pipeline/metadata";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";
import { and, eq, desc } from "drizzle-orm";

export const maxDuration = 300;

type StageName = PipelineStageName;

const STAGES: StageName[] = [...PIPELINE_STAGE_ORDER];

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await acquireLock("pipeline", 330);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  const triggerType = req.headers.get("x-trigger-type") || "cron";
  const [run] = await db
    .insert(pipelineRuns)
    .values({
      triggerType,
      source: "pipeline",
      status: "started",
      metadata: {
        stageOrder: STAGES,
      },
    })
    .returning();

  const stageResults: Array<{
    stage: StageName;
    status: "completed" | "failed" | "skipped";
    durationMs: number;
    result?: Record<string, unknown>;
    error?: string;
  }> = [];

  const pipelineStartMs = Date.now();
  let dependencyFailed = false;
  let hadRecoverableErrors = false;
  let dataChanged = false;
  let skipRemainingStages = false;
  const splitEnabled = isSplitPipelineEnabled();
  const delegatedStages = new Set<StageName>(
    splitEnabled ? ["analyze", "aggregate", "coordination", "briefing"] : []
  );

  // Heavy stages that can be skipped when budget is tight or no new data
  const HEAVY_STAGES: StageName[] = ["analyze", "aggregate", "coordination", "briefing"];
  // Minimum time budget (ms) needed to start a heavy stage
  const HEAVY_STAGE_MIN_BUDGET_MS = 120_000; // 120s — won't start heavy stages with <120s remaining
  const MAX_BUDGET_MS = 280_000; // 280s out of 300s, leave 20s margin for cleanup
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

  try {
    for (const stage of STAGES) {
      if (delegatedStages.has(stage)) {
        const [skipped] = await db
          .insert(pipelineStageRuns)
          .values({
            pipelineRunId: run.id,
            stage,
            status: "skipped",
            result: { reason: "delegated_to_split_schedule" },
            completedAt: new Date(),
            durationMs: 0,
          })
          .onConflictDoUpdate({
            target: [pipelineStageRuns.pipelineRunId, pipelineStageRuns.stage],
            set: {
              status: "skipped",
              result: { reason: "delegated_to_split_schedule" },
              completedAt: new Date(),
              durationMs: 0,
            },
          })
          .returning();

        stageResults.push({
          stage,
          status: "skipped",
          durationMs: skipped.durationMs || 0,
          result: { reason: "delegated_to_split_schedule" },
        });
        continue;
      }

      // Time-budget check for heavy stages
      if (!skipRemainingStages && HEAVY_STAGES.includes(stage)) {
        const elapsedMs = Date.now() - pipelineStartMs;
        const remainingMs = MAX_BUDGET_MS - elapsedMs;
        if (remainingMs < HEAVY_STAGE_MIN_BUDGET_MS) {
          skipRemainingStages = true;
          console.log(
            `[pipeline] Skipping ${stage}+ — only ${Math.round(remainingMs / 1000)}s remaining (need ${HEAVY_STAGE_MIN_BUDGET_MS / 1000}s)`
          );
        }
      }

      // Skip logic: upstream failure, time budget, or no-new-data fast path
      if (dependencyFailed || skipRemainingStages) {
        const reason = dependencyFailed
          ? "upstream stage failed"
          : "time_budget";
        const [skipped] = await db
          .insert(pipelineStageRuns)
          .values({
            pipelineRunId: run.id,
            stage,
            status: "skipped",
            result: { reason },
            completedAt: new Date(),
            durationMs: 0,
          })
          .onConflictDoUpdate({
            target: [pipelineStageRuns.pipelineRunId, pipelineStageRuns.stage],
            set: {
              status: "skipped",
              result: { reason },
              completedAt: new Date(),
              durationMs: 0,
            },
          })
          .returning();

        stageResults.push({
          stage,
          status: "skipped",
          durationMs: skipped.durationMs || 0,
          result: { reason },
        });
        continue;
      }

      const stageStartedAt = new Date();
      await db
        .insert(pipelineStageRuns)
        .values({
          pipelineRunId: run.id,
          stage,
          status: "started",
          startedAt: stageStartedAt,
        })
        .onConflictDoNothing();

      try {
        const result = await executeStage(stage);
        const durationMs = Date.now() - stageStartedAt.getTime();

        if (Array.isArray((result as { errors?: unknown[] }).errors)) {
          const errs = (result as { errors: unknown[] }).errors;
          if (errs.length > 0) hadRecoverableErrors = true;
        }

        await db
          .update(pipelineStageRuns)
          .set({
            status: "completed",
            completedAt: new Date(),
            durationMs,
            result,
          })
          .where(
            and(
              eq(pipelineStageRuns.pipelineRunId, run.id),
              eq(pipelineStageRuns.stage, stage)
            )
          );

        stageResults.push({
          stage,
          status: "completed",
          durationMs,
          result,
        });

        // Track whether ingest/enrich produced new data
        if (stage === "ingest") {
          const r = result as { postsIngested?: number; commentsIngested?: number };
          if ((r.postsIngested || 0) > 0 || (r.commentsIngested || 0) > 0) {
            dataChanged = true;
          }
        }

        if (stage === "enrich") {
          const r = result as { enriched?: number };
          if ((r.enriched || 0) > 0) {
            dataChanged = true;
          }

          // After enrich: if no new data AND recent analysis exists, skip heavy stages
          if (!dataChanged) {
            const lastAnalyze = await db.query.pipelineStageRuns.findFirst({
              where: and(
                eq(pipelineStageRuns.stage, "analyze"),
                eq(pipelineStageRuns.status, "completed")
              ),
              orderBy: [desc(pipelineStageRuns.completedAt)],
            });

            if (
              lastAnalyze?.completedAt &&
              Date.now() - lastAnalyze.completedAt.getTime() < FOUR_HOURS_MS
            ) {
              skipRemainingStages = true;
            }
          }
        }
      } catch (e: any) {
        const durationMs = Date.now() - stageStartedAt.getTime();
        dependencyFailed = true;

        await db
          .update(pipelineStageRuns)
          .set({
            status: "failed",
            completedAt: new Date(),
            durationMs,
            error: e.message,
          })
          .where(
            and(
              eq(pipelineStageRuns.pipelineRunId, run.id),
              eq(pipelineStageRuns.stage, stage)
            )
          );

        stageResults.push({
          stage,
          status: "failed",
          durationMs,
          error: e.message,
        });
      }
    }

    await invalidateApiCaches();

    const finalStatus = dependencyFailed
      ? "failed"
      : hadRecoverableErrors
        ? "completed_with_errors"
        : "completed";

    await db
      .update(pipelineRuns)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        error: dependencyFailed
          ? stageResults.find((s) => s.status === "failed")?.error || null
          : null,
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json({
      status: finalStatus,
      runId: run.id,
      stages: stageResults,
    });
  } catch (e: any) {
    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: e.message,
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json(
      {
        status: "error",
        runId: run.id,
        error: e.message,
        stages: stageResults,
      },
      { status: 500 }
    );
  } finally {
    await release();
  }
}

async function executeStage(stage: StageName): Promise<Record<string, unknown>> {
  switch (stage) {
    case "ingest":
      return runIngestion();
    case "enrich":
      return runEnrichment();
    case "analyze":
      return runAnalysis();
    case "aggregate":
      return runAggregation();
    case "coordination": {
      const [coordination, communities] = await Promise.all([
        detectCoordination(),
        detectCommunities(),
      ]);
      return { ...coordination, communities };
    }
    case "briefing":
      return generateBriefing();
    default:
      return {};
  }
}
