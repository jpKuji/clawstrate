import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { actions, agents } from "@/lib/db/schema";
import { desc, ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  const pattern = `%${q}%`;
  const results = await db
    .select({
      id: actions.id,
      title: actions.title,
      content: actions.content,
      actionType: actions.actionType,
      performedAt: actions.performedAt,
      agentName: agents.displayName,
      upvotes: actions.upvotes,
    })
    .from(actions)
    .leftJoin(agents, sql`${agents.id} = ${actions.agentId}`)
    .where(
      or(
        ilike(actions.title, pattern),
        ilike(actions.content, pattern)
      )
    )
    .orderBy(desc(actions.performedAt))
    .limit(limit);

  return NextResponse.json({ results, query: q });
}
