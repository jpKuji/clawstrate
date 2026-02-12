import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { actions, agents, topics, enrichments, actionTopics, agentIdentities } from "@/lib/db/schema";
import { count, avg, gte, and, lt, eq, sql, inArray, desc } from "drizzle-orm";
import { subHours } from "date-fns";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(req?: NextRequest) {
  const { searchParams } = new URL(
    req?.url || "http://localhost/api/v1/dashboard"
  );
  const source = searchParams.get("source") || "all";
  const sourceKey = source === "all" ? "all" : source.toLowerCase();

  // Check cache first
  const cacheKey = `dashboard:${sourceKey}`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  const now = new Date();
  const last24h = subHours(now, 24);
  const last48h = subHours(now, 48);
  const sourceActionFilter =
    source === "all" ? undefined : eq(actions.platformId, source);

  const [
    totalActions,
    totalAgents,
    recentActions,
    previousActions,
    previousAgents,
    networkStats,
    previousNetworkStats,
    latestBriefing,
    topTopics,
    topAgents,
    currentSourceCounts,
    previousSourceCounts,
    topOfferings,
  ] = await Promise.all([
    source === "all"
      ? db.select({ count: count(actions.id) }).from(actions)
      : db
          .select({ count: count(actions.id) })
          .from(actions)
          .where(eq(actions.platformId, source)),
    source === "all"
      ? db.select({ count: count(agents.id) }).from(agents)
      : db
          .select({
            count: sql<number>`COUNT(DISTINCT ${actions.agentId})`.as("count"),
          })
          .from(actions)
          .where(sourceActionFilter),
    db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(
        and(gte(actions.performedAt, last24h), sourceActionFilter)
      ),
    db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(
        and(
          gte(actions.performedAt, last48h),
          lt(actions.performedAt, last24h),
          sourceActionFilter
        )
      ),
    source === "all"
      ? db
          .select({ count: count(agents.id) })
          .from(agents)
          .where(lt(agents.firstSeenAt, last24h))
      : db
          .select({
            count: sql<number>`COUNT(DISTINCT ${actions.agentId})`.as("count"),
          })
          .from(actions)
          .where(
            and(
              lt(actions.performedAt, last24h),
              sourceActionFilter
            )
          ),
    db
      .select({
        avgAutonomy: avg(enrichments.autonomyScore),
        avgSentiment: avg(enrichments.sentiment),
      })
      .from(enrichments)
      .innerJoin(actions, eq(enrichments.actionId, actions.id))
      .where(
        and(
          gte(actions.performedAt, last24h),
          sourceActionFilter
        )
      ),
    db
      .select({
        avgAutonomy: avg(enrichments.autonomyScore),
        avgSentiment: avg(enrichments.sentiment),
      })
      .from(enrichments)
      .innerJoin(actions, eq(enrichments.actionId, actions.id))
      .where(and(
        gte(actions.performedAt, last48h),
        lt(actions.performedAt, last24h),
        sourceActionFilter,
      )),
    source === "all"
      ? db.query.narratives.findFirst({
          orderBy: (n, { desc }) => [desc(n.generatedAt)],
        })
      : Promise.resolve(null),
    source === "all"
      ? db.query.topics.findMany({
          orderBy: (t, { desc }) => [desc(t.velocity)],
          limit: 10,
        })
      : (async () => {
          const filteredTopicIds = await db
            .select({
              topicId: actionTopics.topicId,
              recentCount: count(actionTopics.id).as("recent_count"),
            })
            .from(actionTopics)
            .innerJoin(actions, eq(actionTopics.actionId, actions.id))
            .where(
              and(
                eq(actions.platformId, source),
                gte(actions.performedAt, last24h)
              )
            )
            .groupBy(actionTopics.topicId)
            .orderBy(desc(count(actionTopics.id)))
            .limit(10);

          if (filteredTopicIds.length === 0) return [];
          const ids = filteredTopicIds.map((r) => r.topicId);
          const topicRows = await db.query.topics.findMany({
            where: inArray(topics.id, ids),
          });
          const byId = new Map(topicRows.map((t) => [t.id, t]));
          return filteredTopicIds
            .map((r) => byId.get(r.topicId))
            .filter(Boolean);
        })(),
    source === "all"
      ? db.query.agents.findMany({
          orderBy: (a, { desc }) => [desc(a.influenceScore)],
          limit: 10,
        })
      : db.query.agents.findMany({
          where: sql`EXISTS (
            SELECT 1 FROM actions a
            WHERE a.agent_id = ${agents.id}
              AND a.platform_id = ${source}
          )`,
          orderBy: (a, { desc }) => [desc(a.influenceScore)],
          limit: 10,
        }),
    // sourceActivity: per-platform action counts (current 24h)
    source === "all"
      ? db
          .select({
            platformId: actions.platformId,
            actionType: actions.actionType,
            cnt: count(actions.id),
          })
          .from(actions)
          .where(gte(actions.performedAt, last24h))
          .groupBy(actions.platformId, actions.actionType)
      : Promise.resolve([]),
    // sourceActivity: per-platform action counts (previous 24h)
    source === "all"
      ? db
          .select({
            platformId: actions.platformId,
            actionType: actions.actionType,
            cnt: count(actions.id),
          })
          .from(actions)
          .where(
            and(
              gte(actions.performedAt, last48h),
              lt(actions.performedAt, last24h)
            )
          )
          .groupBy(actions.platformId, actions.actionType)
      : Promise.resolve([]),
    // sourceActivity: top offering per platform (hottest post in last 24h)
    source === "all"
      ? db.execute(sql`
          SELECT DISTINCT ON (platform_id) platform_id, title, reply_count, url
          FROM actions
          WHERE action_type = 'post' AND performed_at >= ${last24h}
          ORDER BY platform_id, reply_count DESC
        `)
      : Promise.resolve({ rows: [] }),
  ]);

  const currentTotalActions = totalActions[0]?.count || 0;
  const currentTotalAgents = totalAgents[0]?.count || 0;
  const currentActionsLast24h = recentActions[0]?.count || 0;
  const prevActionsLast24h = previousActions[0]?.count || 0;
  const prevTotalAgents = previousAgents[0]?.count || 0;
  const currentAutonomy = Number(networkStats[0]?.avgAutonomy || 0);
  const currentSentiment = Number(networkStats[0]?.avgSentiment || 0);
  const prevAutonomy = Number(previousNetworkStats[0]?.avgAutonomy || 0);
  const prevSentiment = Number(previousNetworkStats[0]?.avgSentiment || 0);

  // Build sourceActivity from the 3 new queries
  let sourceActivity: Array<{
    platformId: string;
    posts: { current: number; change: number };
    comments: { current: number; change: number };
    topOffering: { title: string; replies: number; url: string } | null;
  }> = [];

  if (source === "all") {
    // Aggregate current counts by platform
    const currentMap = new Map<string, { posts: number; comments: number }>();
    for (const row of currentSourceCounts) {
      const pid = row.platformId;
      if (!currentMap.has(pid)) currentMap.set(pid, { posts: 0, comments: 0 });
      const entry = currentMap.get(pid)!;
      if (row.actionType === "post") entry.posts = Number(row.cnt);
      else if (row.actionType === "comment" || row.actionType === "reply")
        entry.comments += Number(row.cnt);
    }

    // Aggregate previous counts by platform
    const previousMap = new Map<string, { posts: number; comments: number }>();
    for (const row of previousSourceCounts) {
      const pid = row.platformId;
      if (!previousMap.has(pid)) previousMap.set(pid, { posts: 0, comments: 0 });
      const entry = previousMap.get(pid)!;
      if (row.actionType === "post") entry.posts = Number(row.cnt);
      else if (row.actionType === "comment" || row.actionType === "reply")
        entry.comments += Number(row.cnt);
    }

    // Build top offerings map
    const offeringRows = "rows" in topOfferings ? topOfferings.rows : topOfferings;
    const offeringsMap = new Map<
      string,
      { title: string; replies: number; url: string }
    >();
    for (const row of offeringRows as Array<{
      platform_id: string;
      title: string | null;
      reply_count: number | null;
      url: string | null;
    }>) {
      offeringsMap.set(row.platform_id, {
        title: row.title || "",
        replies: Number(row.reply_count || 0),
        url: row.url || "",
      });
    }

    // Collect all platform IDs across current and previous
    const allPlatformIds = new Set([
      ...currentMap.keys(),
      ...previousMap.keys(),
    ]);

    sourceActivity = Array.from(allPlatformIds).map((pid) => {
      const cur = currentMap.get(pid) || { posts: 0, comments: 0 };
      const prev = previousMap.get(pid) || { posts: 0, comments: 0 };
      return {
        platformId: pid,
        posts: { current: cur.posts, change: cur.posts - prev.posts },
        comments: {
          current: cur.comments,
          change: cur.comments - prev.comments,
        },
        topOffering: offeringsMap.get(pid) || null,
      };
    });
  }

  // Batch-query platformIds for topAgents
  const agentIds = topAgents.map((a) => a.id);
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

  const response = {
    metrics: {
      totalActions: {
        current: currentTotalActions,
        previous: currentTotalActions - currentActionsLast24h + prevActionsLast24h,
        change: currentActionsLast24h - prevActionsLast24h,
      },
      totalAgents: {
        current: currentTotalAgents,
        previous: prevTotalAgents,
        change: currentTotalAgents - prevTotalAgents,
      },
      actionsLast24h: {
        current: currentActionsLast24h,
        previous: prevActionsLast24h,
        change: currentActionsLast24h - prevActionsLast24h,
      },
      networkAutonomy: {
        current: currentAutonomy.toFixed(2),
        previous: prevAutonomy.toFixed(2),
        change: Number((currentAutonomy - prevAutonomy).toFixed(4)),
      },
      networkSentiment: {
        current: currentSentiment.toFixed(2),
        previous: prevSentiment.toFixed(2),
        change: Number((currentSentiment - prevSentiment).toFixed(4)),
      },
    },
    latestBriefing: latestBriefing
      ? {
          id: latestBriefing.id,
          title: latestBriefing.title,
          summary: latestBriefing.summary,
          generatedAt: latestBriefing.generatedAt,
          actionsAnalyzed: latestBriefing.actionsAnalyzed,
          agentsActive: latestBriefing.agentsActive,
          content: latestBriefing.content,
        }
      : null,
    topTopics,
    topAgents: topAgents.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      influenceScore: a.influenceScore,
      autonomyScore: a.autonomyScore,
      agentType: a.agentType,
      platformIds: platformMap.get(a.id) || [],
      actorKind: actorKindMap.get(a.id) || "ai",
    })),
    sourceActivity,
  };

  // Cache for 60 seconds
  await cacheSet(cacheKey, response, 60);

  return NextResponse.json(response);
}
