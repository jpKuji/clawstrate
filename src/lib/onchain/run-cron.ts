import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";
import { runOnchainIngestion } from "./ingest";

export async function runOnchainCron(
  req: NextRequest,
  opts: {
    backfill: boolean;
    lockKey: string;
    source: string;
    stage: string;
  }
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await acquireLock(opts.lockKey, 330);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  const triggerType = req.headers.get("x-trigger-type") || "cron";
  const [run] = await db
    .insert(pipelineRuns)
    .values({
      triggerType,
      source: opts.source,
      status: "started",
      metadata: {
        stageOrder: [opts.stage],
        backfill: opts.backfill,
      },
    })
    .returning();

  const stageStartedAt = new Date();

  await db.insert(pipelineStageRuns).values({
    pipelineRunId: run.id,
    stage: opts.stage,
    status: "started",
    startedAt: stageStartedAt,
  });

  try {
    const result = await runOnchainIngestion({ backfill: opts.backfill });
    const durationMs = Date.now() - stageStartedAt.getTime();

    await db
      .update(pipelineStageRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationMs,
        result: result as unknown as Record<string, unknown>,
      })
      .where(
        and(
          eq(pipelineStageRuns.pipelineRunId, run.id),
          eq(pipelineStageRuns.stage, opts.stage)
        )
      );

    await db
      .update(pipelineRuns)
      .set({
        status: result.errors.length > 0 ? "completed_with_errors" : "completed",
        completedAt: new Date(),
        error: result.errors.length > 0 ? result.errors.join("; ") : null,
      })
      .where(eq(pipelineRuns.id, run.id));

    await invalidateApiCaches();

    return NextResponse.json({
      status: result.errors.length > 0 ? "completed_with_errors" : "completed",
      runId: run.id,
      ...result,
    });
  } catch (error: any) {
    const durationMs = Date.now() - stageStartedAt.getTime();

    await db
      .update(pipelineStageRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        durationMs,
        error: error?.message ?? "unknown_error",
      })
      .where(
        and(
          eq(pipelineStageRuns.pipelineRunId, run.id),
          eq(pipelineStageRuns.stage, opts.stage)
        )
      );

    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error?.message ?? "unknown_error",
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json(
      {
        status: "failed",
        runId: run.id,
        error: error?.message ?? "unknown_error",
      },
      { status: 500 }
    );
  } finally {
    await release();
  }
}
