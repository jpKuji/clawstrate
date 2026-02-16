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
  const rows = await db
    .select()
    .from(pipelineStageCursors)
    .where(
      and(
        eq(pipelineStageCursors.stage, stage),
        eq(pipelineStageCursors.scope, scope)
      )
    )
    .limit(1);

  const row = rows[0];
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
  await db
    .insert(pipelineStageCursors)
    .values({
      stage,
      scope,
      cursorTs,
      cursorMeta: cursorMeta ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pipelineStageCursors.stage, pipelineStageCursors.scope],
      set: {
        cursorTs,
        cursorMeta: cursorMeta ?? {},
        updatedAt: new Date(),
      },
    });
}
