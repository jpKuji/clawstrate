import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { runIngestion } from "@/lib/pipeline/ingest";
import { runEnrichment } from "@/lib/pipeline/enrich";
import { runAnalysis } from "@/lib/pipeline/analyze";
import { runAggregation } from "@/lib/pipeline/aggregate";
import { detectCoordination, detectCommunities } from "@/lib/pipeline/coordination";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";
import { and, eq } from "drizzle-orm";

export const maxDuration = 300;

type StageName =
  | "ingest"
  | "enrich"
  | "analyze"
  | "aggregate"
  | "coordination"
  | "briefing";

const STAGES: StageName[] = [
  "ingest",
  "enrich",
  "analyze",
  "aggregate",
  "coordination",
  "briefing",
];

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

  const release = await acquireLock("pipeline", 900);
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

  let dependencyFailed = false;
  let hadRecoverableErrors = false;

  try {
    for (const stage of STAGES) {
      if (dependencyFailed) {
        const [skipped] = await db
          .insert(pipelineStageRuns)
          .values({
            pipelineRunId: run.id,
            stage,
            status: "skipped",
            result: {
              reason: "upstream stage failed",
            },
            completedAt: new Date(),
            durationMs: 0,
          })
          .onConflictDoUpdate({
            target: [pipelineStageRuns.pipelineRunId, pipelineStageRuns.stage],
            set: {
              status: "skipped",
              result: { reason: "upstream stage failed" },
              completedAt: new Date(),
              durationMs: 0,
            },
          })
          .returning();

        stageResults.push({
          stage,
          status: "skipped",
          durationMs: skipped.durationMs || 0,
          result: { reason: "upstream stage failed" },
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
