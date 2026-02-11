import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, interactions } from "@/lib/db/schema";
import { desc, sql, count } from "drizzle-orm";
import { subDays } from "date-fns";

export async function GET() {
  const last7d = subDays(new Date(), 7);

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
      sql`${interactions.sourceAgentId} = ANY(${agentIds}) AND ${interactions.targetAgentId} = ANY(${agentIds}) AND ${interactions.createdAt} >= ${last7d}`
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
