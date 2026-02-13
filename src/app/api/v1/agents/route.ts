import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentIdentities } from "@/lib/db/schema";
import { desc, asc, sql, inArray } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";
import {
  actorKindFromRawProfile,
  formatAgentDisplayLabel,
  resolveActorKind,
  sourceProfileTypeFromPlatforms,
} from "@/lib/agents/classify";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const sortBy = searchParams.get("sort") || "influence"; // influence, autonomy, activity, recent
  const order = searchParams.get("order") || "desc";
  const source = searchParams.get("source") || "all";
  const actor = searchParams.get("actor") === "all" ? "all" : "ai";

  // Check cache first
  const cacheKey = `agents:${sortBy}:${order}:${limit}:${source}:${actor}`;
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
        const aiOnlyFilter = sql`NOT EXISTS (
          SELECT 1 FROM agent_identities ai
          WHERE ai.agent_id = ${agents.id}
            AND (ai.raw_profile->>'actorKind') = 'human'
        )`;
        const actorFilter = actor === "all" ? sql`TRUE` : aiOnlyFilter;
        if (source === "all") return actorFilter;
        return sql`EXISTS (
          SELECT 1 FROM agent_identities ai
          WHERE ai.agent_id = ${agents.id}
            AND ai.platform_id = ${source}
        ) AND ${actorFilter}`;
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
              platformUserId: agentIdentities.platformUserId,
              rawProfile: agentIdentities.rawProfile,
            })
            .from(agentIdentities)
            .where(inArray(agentIdentities.agentId, agentIds))
        : [];

    const identityMap = new Map<string, typeof identities>();
    for (const identity of identities) {
      const list = identityMap.get(identity.agentId) || [];
      list.push(identity);
      identityMap.set(identity.agentId, list);
    }

    const enrichedResults = results.map((a) => {
      const agentIdentities = identityMap.get(a.id) || [];
      const platformIds = Array.from(
        new Set(agentIdentities.map((i) => i.platformId))
      );
      const resolvedActorKind = resolveActorKind(
        agentIdentities.map((i) => actorKindFromRawProfile(i.rawProfile))
      );
      const sourceProfileType = sourceProfileTypeFromPlatforms(platformIds);
      const identityForLabel =
        (source !== "all"
          ? agentIdentities.find((i) => i.platformId === source)
          : undefined) ||
        agentIdentities.find((i) => i.platformId === "rentahuman") ||
        agentIdentities[0];

      return {
        ...a,
        platformIds,
        actorKind: resolvedActorKind,
        sourceProfileType,
        displayLabel: formatAgentDisplayLabel({
          displayName: a.displayName,
          platformId: identityForLabel?.platformId,
          platformUserId: identityForLabel?.platformUserId,
        }),
      };
    });

    // Cache for 60 seconds
    await cacheSet(cacheKey, enrichedResults, 60);

    return NextResponse.json(enrichedResults);
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json([], { status: 500 });
  }
}
