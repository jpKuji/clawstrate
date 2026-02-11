import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { desc, asc } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const sortBy = searchParams.get("sort") || "influence"; // influence, autonomy, activity, recent
  const order = searchParams.get("order") || "desc";

  // Check cache first
  const cacheKey = `agents:${sortBy}:${order}:${limit}`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  const sortMap: Record<string, any> = {
    influence: agents.influenceScore,
    autonomy: agents.autonomyScore,
    activity: agents.activityScore,
    recent: agents.lastSeenAt,
    actions: agents.totalActions,
  };

  const sortField = sortMap[sortBy] || agents.influenceScore;
  const orderFn = order === "asc" ? asc : desc;

  const results = await db.query.agents.findMany({
    orderBy: [orderFn(sortField)],
    limit,
  });

  // Cache for 60 seconds
  await cacheSet(cacheKey, results, 60);

  return NextResponse.json(results);
}
