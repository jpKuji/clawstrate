import { and, eq } from "drizzle-orm";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { pipelineStageCursors } from "@/lib/db/schema";

export type CursorStage = "analyze" | "aggregate" | "coordination";
export const GLOBAL_CURSOR_SCOPE = "global";

export interface StageCursor {
  stage: CursorStage;
  scope: string;
  cursorTs: Date;
  cursorMeta: Record<string, unknown> | null;
  updatedAt: Date;
}

export function getBootstrapStart(stage: CursorStage, now: Date = new Date()): Date {
  switch (stage) {
    case "aggregate":
      return subDays(now, 7);
    case "analyze":
    case "coordination":
      return subDays(now, 14);
    default:
      return subDays(now, 7);
  }
}

export async function getStageCursor(
  stage: CursorStage,
  scope: string = GLOBAL_CURSOR_SCOPE
): Promise<StageCursor | null> {
  const queryApi = (db as unknown as { query?: Record<string, unknown> }).query;
  const cursorQuery = queryApi?.pipelineStageCursors as
    | { findFirst?: (args: unknown) => Promise<unknown> }
    | undefined;
  const findFirst = cursorQuery?.findFirst;

  if (!findFirst) {
    return null;
  }

  const row = (await findFirst({
    where: and(eq(pipelineStageCursors.stage, stage), eq(pipelineStageCursors.scope, scope)),
  })) as
    | {
        stage: string;
        scope: string;
        cursorTs: Date;
        cursorMeta: Record<string, unknown> | null;
        updatedAt: Date;
      }
    | null;

  if (!row) return null;

  return {
    stage: row.stage as CursorStage,
    scope: row.scope,
    cursorTs: row.cursorTs,
    cursorMeta: row.cursorMeta ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function setStageCursor(
  stage: CursorStage,
  scope: string,
  cursorTs: Date,
  cursorMeta?: Record<string, unknown>
): Promise<void> {
  const values = {
    stage,
    scope,
    cursorTs,
    cursorMeta: cursorMeta ?? {},
    updatedAt: new Date(),
  };

  const insertBuilder = db.insert(pipelineStageCursors).values(values) as {
    onConflictDoUpdate?: (args: unknown) => Promise<unknown>;
    onConflictDoNothing?: (args?: unknown) => { returning?: (args?: unknown) => Promise<unknown> };
  };

  if (insertBuilder.onConflictDoUpdate) {
    await insertBuilder.onConflictDoUpdate({
      target: [pipelineStageCursors.stage, pipelineStageCursors.scope],
      set: {
        cursorTs,
        cursorMeta: cursorMeta ?? {},
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (insertBuilder.onConflictDoNothing) {
    const chain = insertBuilder.onConflictDoNothing();
    if (chain?.returning) {
      await chain.returning();
    }
  }
}
