import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";

export type LoggedStandaloneStage = "analyze" | "aggregate" | "coordination" | "briefing";

interface RunLoggedStageOptions<T extends Record<string, unknown>> {
  req: NextRequest;
  stage: LoggedStandaloneStage;
  lockKey: string;
  lockTtlSeconds: number;
  execute: () => Promise<T>;
  invalidateCaches?: boolean;
}

export async function runLoggedStage<T extends Record<string, unknown>>(
  options: RunLoggedStageOptions<T>
): Promise<NextResponse> {
  const authHeader = options.req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await acquireLock(options.lockKey, options.lockTtlSeconds);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  const triggerType = options.req.headers.get("x-trigger-type") || "cron";
  const [run] = await db
    .insert(pipelineRuns)
    .values({
      triggerType,
      source: options.stage,
      status: "started",
      metadata: {
        stageOrder: [options.stage],
        standalone: true,
      },
    })
    .returning();

  const stageStartedAt = new Date();

  await db.insert(pipelineStageRuns).values({
    pipelineRunId: run.id,
    stage: options.stage,
    status: "started",
    startedAt: stageStartedAt,
  });

  try {
    const result = await options.execute();
    const durationMs = Date.now() - stageStartedAt.getTime();

    if (options.invalidateCaches !== false) {
      await invalidateApiCaches();
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
          eq(pipelineStageRuns.stage, options.stage)
        )
      );

    await db
      .update(pipelineRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json({ status: "completed", runId: run.id, ...result });
  } catch (error: any) {
    const durationMs = Date.now() - stageStartedAt.getTime();

    await db
      .update(pipelineStageRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        durationMs,
        error: error?.message || "unknown_error",
      })
      .where(
        and(
          eq(pipelineStageRuns.pipelineRunId, run.id),
          eq(pipelineStageRuns.stage, options.stage)
        )
      );

    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error?.message || "unknown_error",
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json(
      { status: "error", runId: run.id, error: error?.message || "unknown_error" },
      { status: 500 }
    );
  } finally {
    await release();
  }
}
