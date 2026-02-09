import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const sortBy = searchParams.get("sort") || "velocity";

  const sortMap: Record<string, any> = {
    velocity: topics.velocity,
    actions: topics.actionCount,
    agents: topics.agentCount,
    recent: topics.lastSeenAt,
  };

  const results = await db.query.topics.findMany({
    orderBy: [desc(sortMap[sortBy] || topics.velocity)],
    limit,
  });

  return NextResponse.json(results);
}
