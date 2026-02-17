import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, pipelineStageRuns } from "@/lib/db/schema";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";
import { runOnchainIngestion } from "./ingest";

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const ONCHAIN_LOCK_TTL_SECONDS = envPositiveInt("ONCHAIN_LOCK_TTL_SECONDS", 1_800);
const ONCHAIN_STALE_RUN_MINUTES = envPositiveInt("ONCHAIN_STALE_RUN_MINUTES", 20);
const STORED_ERROR_MAX_LEN = envPositiveInt("ONCHAIN_STORED_ERROR_MAX_LEN", 400);
const STORED_ERROR_MAX_ITEMS = envPositiveInt("ONCHAIN_STORED_ERROR_MAX_ITEMS", 40);

function compactError(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input ?? "unknown_error");
  const sanitized = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (sanitized.length <= STORED_ERROR_MAX_LEN) return sanitized;
  return `${sanitized.slice(0, STORED_ERROR_MAX_LEN)}...`;
}

function compactErrorList(errors: string[]): string[] {
  return errors
    .slice(0, STORED_ERROR_MAX_ITEMS)
    .map((error) => compactError(error));
}

function compactResultForStorage(result: Awaited<ReturnType<typeof runOnchainIngestion>>) {
  return {
    ...result,
    errors: compactErrorList(result.errors),
  } as unknown as Record<string, unknown>;
}

async function recoverStaleOnchainRuns(opts: {
  source: string;
  stage: string;
  staleMinutes: number;
}): Promise<string[]> {
  const cutoff = new Date(Date.now() - opts.staleMinutes * 60_000);
  const staleRows = await db
    .select({ runId: pipelineRuns.id })
    .from(pipelineRuns)
    .innerJoin(
      pipelineStageRuns,
      and(
        eq(pipelineStageRuns.pipelineRunId, pipelineRuns.id),
        eq(pipelineStageRuns.stage, opts.stage)
      )
    )
    .where(
      and(
        eq(pipelineRuns.source, opts.source),
        eq(pipelineRuns.status, "started"),
        eq(pipelineStageRuns.status, "started"),
        lt(pipelineStageRuns.startedAt, cutoff)
      )
    );

  const staleRunIds = Array.from(new Set(staleRows.map((row) => row.runId)));
  if (staleRunIds.length === 0) return [];

  const now = new Date();
  const staleError = `Recovered stale ${opts.stage} run older than ${opts.staleMinutes} minutes`;

  await db
    .update(pipelineStageRuns)
    .set({
      status: "failed",
      completedAt: now,
      error: staleError,
    })
    .where(
      and(
        eq(pipelineStageRuns.stage, opts.stage),
        eq(pipelineStageRuns.status, "started"),
        inArray(pipelineStageRuns.pipelineRunId, staleRunIds)
      )
    );

  await db
    .update(pipelineRuns)
    .set({
      status: "failed",
      completedAt: now,
      error: staleError,
    })
    .where(and(eq(pipelineRuns.status, "started"), inArray(pipelineRuns.id, staleRunIds)));

  return staleRunIds;
}

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

  const release = await acquireLock(opts.lockKey, ONCHAIN_LOCK_TTL_SECONDS);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  const recoveredStaleRunIds = await recoverStaleOnchainRuns({
    source: opts.source,
    stage: opts.stage,
    staleMinutes: ONCHAIN_STALE_RUN_MINUTES,
  });

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
        recoveredStaleRunIds,
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
    const compactedErrors = compactErrorList(result.errors);

    await db
      .update(pipelineStageRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationMs,
        result: compactResultForStorage(result),
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
        status: compactedErrors.length > 0 ? "completed_with_errors" : "completed",
        completedAt: new Date(),
        error: compactedErrors.length > 0 ? compactedErrors.join("; ") : null,
      })
      .where(eq(pipelineRuns.id, run.id));

    await invalidateApiCaches();

    return NextResponse.json({
      status: compactedErrors.length > 0 ? "completed_with_errors" : "completed",
      runId: run.id,
      recoveredStaleRuns: recoveredStaleRunIds.length,
      recoveredStaleRunIds,
      ...result,
      errors: compactedErrors,
    });
  } catch (error: any) {
    const durationMs = Date.now() - stageStartedAt.getTime();
    const compacted = compactError(error);

    await db
      .update(pipelineStageRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        durationMs,
        error: compacted,
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
        error: compacted,
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json(
      {
        status: "failed",
        runId: run.id,
        error: compacted,
      },
      { status: 500 }
    );
  } finally {
    await release();
  }
}
