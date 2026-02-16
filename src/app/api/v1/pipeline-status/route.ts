import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { PIPELINE_STAGE_ORDER } from "@/lib/pipeline/metadata";

export async function GET() {
  const now = Date.now();

  const recentRuns = await db.query.pipelineRuns.findMany({
    orderBy: [desc(pipelineRuns.startedAt)],
    limit: 10,
  });

  const runIds = recentRuns.map((run) => run.id);
  const stageRows =
    runIds.length > 0
      ? await db.query.pipelineStageRuns.findMany({
          where: inArray(pipelineStageRuns.pipelineRunId, runIds),
          orderBy: [desc(pipelineStageRuns.startedAt)],
        })
      : [];

  const stagesByRun = new Map<string, typeof stageRows>();
  for (const row of stageRows) {
    const list = stagesByRun.get(row.pipelineRunId) || [];
    list.push(row);
    stagesByRun.set(row.pipelineRunId, list);
  }

  const runs = recentRuns.map((run) => {
    const stages = stagesByRun.get(run.id) || [];
    return {
      id: run.id,
      triggerType: run.triggerType,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.completedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : null,
      error: run.error,
      stages: stages.map((s) => ({
        stage: s.stage,
        status: s.status,
        durationMs: s.durationMs,
        error: s.error,
        result: s.result,
      })),
    };
  });

  const latestCompletedRows = await db
    .select({
      stage: pipelineStageRuns.stage,
      pipelineRunId: pipelineStageRuns.pipelineRunId,
      completedAt: pipelineStageRuns.completedAt,
      durationMs: pipelineStageRuns.durationMs,
      result: pipelineStageRuns.result,
    })
    .from(pipelineStageRuns)
    .where(
      and(
        eq(pipelineStageRuns.status, "completed"),
        isNotNull(pipelineStageRuns.completedAt)
      )
    )
    .orderBy(desc(pipelineStageRuns.completedAt))
    .limit(300);

  const latestByStage: Record<
    string,
    {
      stage: string;
      pipelineRunId: string;
      completedAt: Date;
      durationMs: number | null;
      result: Record<string, unknown> | null;
      minutesSinceLastCompleted: number;
    } | null
  > = {};

  for (const stage of PIPELINE_STAGE_ORDER) {
    latestByStage[stage] = null;
  }

  for (const row of latestCompletedRows) {
    if (!(row.stage in latestByStage)) continue;
    if (latestByStage[row.stage]) continue;
    if (!row.completedAt) continue;

    latestByStage[row.stage] = {
      stage: row.stage,
      pipelineRunId: row.pipelineRunId,
      completedAt: row.completedAt,
      durationMs: row.durationMs,
      result: row.result ?? null,
      minutesSinceLastCompleted: Math.max(
        0,
        Math.floor((now - row.completedAt.getTime()) / 60000)
      ),
    };
  }

  const lastSuccess = runs.find((r) => r.status === "completed");
  const lastFailure = runs.find((r) => r.status === "failed");
  const recentFailures = runs.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    health:
      recentFailures === 0
        ? "healthy"
        : recentFailures >= 8
          ? "critical"
          : "degraded",
    summary: {
      totalRuns: runs.length,
      recentFailures,
      lastSuccess: lastSuccess?.startedAt ?? null,
      lastFailure: lastFailure?.startedAt ?? null,
      lastFailureError: lastFailure?.error ?? null,
    },
    latestByStage,
    runs,
  });
}
