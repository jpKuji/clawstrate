import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, interactions, actions } from "@/lib/db/schema";
import { desc, sql, count, and, inArray, gte, eq } from "drizzle-orm";
import { subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "all";
  const last30d = subDays(new Date(), 30);

  // Get top 50 agents by influence
  const topAgents = await db.query.agents.findMany({
    where:
      source === "all"
        ? undefined
        : sql`EXISTS (
            SELECT 1 FROM ${actions}
            WHERE ${actions.agentId} = ${agents.id}
              AND ${actions.platformId} = ${source}
          )`,
    orderBy: [desc(agents.influenceScore)],
    limit: 50,
  });

  const agentIds = topAgents.map((a) => a.id);
  if (agentIds.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  // Get interactions between these agents
  const edges =
    source === "all"
      ? await db
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
          .groupBy(interactions.sourceAgentId, interactions.targetAgentId)
      : await db
          .select({
            source: interactions.sourceAgentId,
            target: interactions.targetAgentId,
            weight: sql<number>`SUM(${interactions.weight})`.as("weight"),
            count: count(interactions.id).as("count"),
          })
          .from(interactions)
          .innerJoin(actions, eq(interactions.actionId, actions.id))
          .where(
            and(
              inArray(interactions.sourceAgentId, agentIds),
              inArray(interactions.targetAgentId, agentIds),
              gte(interactions.createdAt, last30d),
              eq(actions.platformId, source)
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
