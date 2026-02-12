import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentIdentities } from "@/lib/db/schema";
import { desc, asc, eq, sql, inArray } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const sortBy = searchParams.get("sort") || "influence"; // influence, autonomy, activity, recent
  const order = searchParams.get("order") || "desc";
  const source = searchParams.get("source") || "all";

  // Check cache first
  const cacheKey = `agents:${sortBy}:${order}:${limit}:${source}`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  try {
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
      where: (() => {
        const humanFilter = sql`NOT EXISTS (
          SELECT 1 FROM agent_identities ai
          WHERE ai.agent_id = ${agents.id}
            AND (ai.raw_profile->>'actorKind') = 'human'
        )`;
        if (source === "all") return humanFilter;
        return sql`EXISTS (
          SELECT 1 FROM agent_identities ai
          WHERE ai.agent_id = ${agents.id}
            AND ai.platform_id = ${source}
        ) AND ${humanFilter}`;
      })(),
      orderBy: [orderFn(sortField)],
      limit,
    });

    // Batch-fetch platform identities for all returned agents
    const agentIds = results.map((a) => a.id);
    const identities =
      agentIds.length > 0
        ? await db
            .select({
              agentId: agentIdentities.agentId,
              platformId: agentIdentities.platformId,
              rawProfile: agentIdentities.rawProfile,
            })
            .from(agentIdentities)
            .where(inArray(agentIdentities.agentId, agentIds))
        : [];

    const platformMap = new Map<string, string[]>();
    const actorKindMap = new Map<string, string>();
    for (const row of identities) {
      const list = platformMap.get(row.agentId) || [];
      list.push(row.platformId);
      platformMap.set(row.agentId, list);

      const kind = (row.rawProfile as Record<string, unknown>)?.actorKind;
      if (kind && !actorKindMap.has(row.agentId)) {
        actorKindMap.set(row.agentId, kind as string);
      }
    }

    const enrichedResults = results.map((a) => ({
      ...a,
      platformIds: platformMap.get(a.id) || [],
      actorKind: actorKindMap.get(a.id) || "ai",
    }));

    // Cache for 60 seconds
    await cacheSet(cacheKey, enrichedResults, 60);

    return NextResponse.json(enrichedResults);
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json([], { status: 500 });
  }
}
