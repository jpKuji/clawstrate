import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { actions, agents, narratives, topics, enrichments } from "@/lib/db/schema";
import { count, avg, gte, and, lt, eq } from "drizzle-orm";
import { subHours } from "date-fns";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET() {
  // Check cache first
  const cached = await cacheGet<any>("dashboard");
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  const now = new Date();
  const last24h = subHours(now, 24);
  const last48h = subHours(now, 48);

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
  ] = await Promise.all([
    db.select({ count: count(actions.id) }).from(actions),
    db.select({ count: count(agents.id) }).from(agents),
    db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(gte(actions.performedAt, last24h)),
    db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(and(gte(actions.performedAt, last48h), lt(actions.performedAt, last24h))),
    db
      .select({ count: count(agents.id) })
      .from(agents)
      .where(lt(agents.firstSeenAt, last24h)),
    db
      .select({
        avgAutonomy: avg(enrichments.autonomyScore),
        avgSentiment: avg(enrichments.sentiment),
      })
      .from(enrichments),
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
      )),
    db.query.narratives.findFirst({
      orderBy: (n, { desc }) => [desc(n.generatedAt)],
    }),
    db.query.topics.findMany({
      orderBy: (t, { desc }) => [desc(t.velocity)],
      limit: 5,
    }),
    db.query.agents.findMany({
      orderBy: (a, { desc }) => [desc(a.influenceScore)],
      limit: 5,
    }),
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
        }
      : null,
    topTopics,
    topAgents: topAgents.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      influenceScore: a.influenceScore,
      autonomyScore: a.autonomyScore,
      agentType: a.agentType,
    })),
  };

  // Cache for 60 seconds
  await cacheSet("dashboard", response, 60);

  return NextResponse.json(response);
}
