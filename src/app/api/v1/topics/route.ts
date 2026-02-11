import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const sortBy = searchParams.get("sort") || "velocity";

  // Check cache first
  const cacheKey = `topics:${sortBy}:${limit}`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

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

  // Cache for 120 seconds
  await cacheSet(cacheKey, results, 120);

  return NextResponse.json(results);
}
