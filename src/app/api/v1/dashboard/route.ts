import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { actions, agents, narratives, topics, enrichments } from "@/lib/db/schema";
import { count, avg, gte, desc, sql } from "drizzle-orm";
import { subHours } from "date-fns";

export async function GET() {
  const now = new Date();
  const last24h = subHours(now, 24);

  const [totalActions, totalAgents, recentActions, latestBriefing, networkStats, topTopics, topAgents] =
    await Promise.all([
      db.select({ count: count(actions.id) }).from(actions),
      db.select({ count: count(agents.id) }).from(agents),
      db
        .select({ count: count(actions.id) })
        .from(actions)
        .where(gte(actions.performedAt, last24h)),
      db.query.narratives.findFirst({
        orderBy: (n, { desc }) => [desc(n.generatedAt)],
      }),
      db
        .select({
          avgAutonomy: avg(enrichments.autonomyScore),
          avgSentiment: avg(enrichments.sentiment),
        })
        .from(enrichments),
      db.query.topics.findMany({
        orderBy: (t, { desc }) => [desc(t.velocity)],
        limit: 5,
      }),
      db.query.agents.findMany({
        orderBy: (a, { desc }) => [desc(a.influenceScore)],
        limit: 5,
      }),
    ]);

  return NextResponse.json({
    metrics: {
      totalActions: totalActions[0]?.count || 0,
      totalAgents: totalAgents[0]?.count || 0,
      actionsLast24h: recentActions[0]?.count || 0,
      networkAutonomy: Number(networkStats[0]?.avgAutonomy || 0).toFixed(2),
      networkSentiment: Number(networkStats[0]?.avgSentiment || 0).toFixed(2),
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
  });
}
