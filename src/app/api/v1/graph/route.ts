import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, interactions, actions } from "@/lib/db/schema";
import { desc, sql, count, and, inArray, gte, eq, asc } from "drizzle-orm";
import { subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "all";
  const requestedWindowDays = Number(searchParams.get("windowDays") || 30);
  const windowDays = [7, 14, 30, 60].includes(requestedWindowDays)
    ? requestedWindowDays
    : 30;
  const requestedMaxNodes = Number(searchParams.get("maxNodes") || 50);
  const maxNodes = Math.max(10, Math.min(requestedMaxNodes || 50, 120));
  const since = subDays(new Date(), windowDays);

  const sourceRows = await db
    .select({ platformId: actions.platformId })
    .from(actions)
    .groupBy(actions.platformId)
    .orderBy(asc(actions.platformId));
  const availableSources = ["all", ...sourceRows.map((row) => row.platformId)];

  if (source !== "all" && !availableSources.includes(source)) {
    return NextResponse.json(
      {
        error: "Unknown source filter",
        availableSources,
      },
      { status: 400 }
    );
  }

  const aggregatedEdges =
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
              gte(interactions.createdAt, since),
              sql`${interactions.sourceAgentId} <> ${interactions.targetAgentId}`
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
              gte(interactions.createdAt, since),
              sql`${interactions.sourceAgentId} <> ${interactions.targetAgentId}`,
              eq(actions.platformId, source)
            )
          )
          .groupBy(interactions.sourceAgentId, interactions.targetAgentId);

  if (aggregatedEdges.length === 0) {
    return NextResponse.json({
      nodes: [],
      edges: [],
      availableSources,
      meta: {
        source,
        windowDays,
        maxNodes,
        totalNodes: 0,
        totalEdges: 0,
      },
    });
  }

  const interactionScores = new Map<string, { totalWeight: number; totalCount: number }>();
  for (const edge of aggregatedEdges) {
    const weight = Number(edge.weight) || 0;
    const edgeCount = Number(edge.count) || 0;

    const sourceScore = interactionScores.get(edge.source) || {
      totalWeight: 0,
      totalCount: 0,
    };
    sourceScore.totalWeight += weight;
    sourceScore.totalCount += edgeCount;
    interactionScores.set(edge.source, sourceScore);

    const targetScore = interactionScores.get(edge.target) || {
      totalWeight: 0,
      totalCount: 0,
    };
    targetScore.totalWeight += weight;
    targetScore.totalCount += edgeCount;
    interactionScores.set(edge.target, targetScore);
  }

  const rankedAgentIds = [...interactionScores.entries()]
    .sort((a, b) => {
      const weightDiff = b[1].totalWeight - a[1].totalWeight;
      if (weightDiff !== 0) return weightDiff;
      const countDiff = b[1].totalCount - a[1].totalCount;
      if (countDiff !== 0) return countDiff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxNodes)
    .map(([agentId]) => agentId);

  const selectedIds = new Set(rankedAgentIds);
  const edges = aggregatedEdges
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: Number(edge.weight) || 0,
      count: Number(edge.count) || 0,
    }));

  const connectedAgentIds = new Set<string>();
  for (const edge of edges) {
    connectedAgentIds.add(edge.source);
    connectedAgentIds.add(edge.target);
  }

  if (connectedAgentIds.size === 0) {
    return NextResponse.json({
      nodes: [],
      edges: [],
      availableSources,
      meta: {
        source,
        windowDays,
        maxNodes,
        totalNodes: 0,
        totalEdges: 0,
      },
    });
  }

  const nodeIds = rankedAgentIds.filter((agentId) => connectedAgentIds.has(agentId));
  const agentRows = await db.query.agents.findMany({
    where: inArray(agents.id, nodeIds),
    orderBy: [desc(agents.influenceScore)],
  });
  const agentById = new Map(agentRows.map((row) => [row.id, row]));

  const nodes = nodeIds
    .map((id) => {
      const agent = agentById.get(id);
      if (!agent) return null;
      const score = interactionScores.get(id);
      return {
        id: agent.id,
        displayName: agent.displayName,
        influenceScore: agent.influenceScore,
        autonomyScore: agent.autonomyScore,
        activityScore: agent.activityScore,
        agentType: agent.agentType,
        communityLabel: agent.communityLabel,
        interactionWeight: score?.totalWeight ?? 0,
        interactionCount: score?.totalCount ?? 0,
      };
    })
    .filter(
      (node): node is {
        id: string;
        displayName: string;
        influenceScore: number | null;
        autonomyScore: number | null;
        activityScore: number | null;
        agentType: string | null;
        communityLabel: number | null;
        interactionWeight: number;
        interactionCount: number;
      } => node !== null
    );

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const finalEdges = edges.filter(
    (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
  );
  const connectedNodeIds = new Set<string>();
  for (const edge of finalEdges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }
  const finalNodes = nodes.filter((node) => connectedNodeIds.has(node.id));

  return NextResponse.json({
    nodes: finalNodes,
    edges: finalEdges,
    availableSources,
    meta: {
      source,
      windowDays,
      maxNodes,
      totalNodes: finalNodes.length,
      totalEdges: finalEdges.length,
    },
  });
}
