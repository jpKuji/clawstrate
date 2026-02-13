import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const recentRuns = await db.query.pipelineRuns.findMany({
    orderBy: [desc(pipelineRuns.startedAt)],
    limit: 10,
  });

  const runs = await Promise.all(
    recentRuns.map(async (run) => {
      const stages = await db.query.pipelineStageRuns.findMany({
        where: eq(pipelineStageRuns.pipelineRunId, run.id),
        orderBy: [desc(pipelineStageRuns.startedAt)],
      });

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
    })
  );

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
    runs,
  });
}
