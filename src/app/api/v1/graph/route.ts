import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, interactions } from "@/lib/db/schema";
import { desc, sql, count, and, inArray, gte } from "drizzle-orm";
import { subDays } from "date-fns";

export async function GET() {
  const last30d = subDays(new Date(), 30);

  // Get top 50 agents by influence
  const topAgents = await db.query.agents.findMany({
    orderBy: [desc(agents.influenceScore)],
    limit: 50,
  });

  const agentIds = topAgents.map((a) => a.id);

  // Get interactions between these agents
  const edges = await db
    .select({
      source: interactions.sourceAgentId,
      target: interactions.targetAgentId,
      weight: sql<number>`SUM(${interactions.weight})`.as("weight"),
      count: count(interactions.id).as("count"),
    })
    .from(interactions)
    .where(
      and(
        inArray(interactions.sourceAgentId, agentIds),
        inArray(interactions.targetAgentId, agentIds),
        gte(interactions.createdAt, last30d)
      )
    )
    .groupBy(interactions.sourceAgentId, interactions.targetAgentId);

  const nodes = topAgents.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    influenceScore: a.influenceScore,
    autonomyScore: a.autonomyScore,
    activityScore: a.activityScore,
    agentType: a.agentType,
    communityLabel: a.communityLabel,
  }));

  return NextResponse.json({ nodes, edges });
}
