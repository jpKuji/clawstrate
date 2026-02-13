import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  agents,
  actions,
  agentProfiles,
  interactions,
  coordinationSignals,
} from "@/lib/db/schema";
import { eq, desc, sql, count, inArray, and } from "drizzle-orm";
import {
  actorKindFromRawProfile,
  formatAgentDisplayLabel,
  resolveActorKind,
  sourceProfileTypeFromPlatforms,
} from "@/lib/agents/classify";
import { computeMarketplaceAgentMetrics } from "@/lib/pipeline/analyze";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
    with: {
      identities: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const identities = agent.identities || [];
  const platformIds = Array.from(new Set(identities.map((i) => i.platformId)));
  const actorKind = resolveActorKind(
    identities.map((i) => actorKindFromRawProfile(i.rawProfile))
  );

  // /agents surfaces are AI-only.
  if (actorKind !== "ai") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profileVariant = sourceProfileTypeFromPlatforms(platformIds);
  const rentAHumanIdentity =
    identities.find((i) => i.platformId === "rentahuman") || identities[0];
  const displayLabel = formatAgentDisplayLabel({
    displayName: agent.displayName,
    platformId: rentAHumanIdentity?.platformId,
    platformUserId: rentAHumanIdentity?.platformUserId,
  });

  if (profileVariant === "marketplace_ai") {
    const [marketplaceMetrics, recentBounties] = await Promise.all([
      computeMarketplaceAgentMetrics(id),
      db.query.actions.findMany({
        where: and(
          eq(actions.agentId, id),
          eq(actions.platformId, "rentahuman"),
          eq(actions.actionType, "post")
        ),
        orderBy: [desc(actions.performedAt)],
        limit: 20,
      }),
    ]);

    return NextResponse.json({
      actorKind: "ai",
      profileVariant: "marketplace_ai",
      sourceProfileType: "marketplace_ai",
      displayLabel,
      agent: {
        ...agent,
        displayLabel,
      },
      marketplaceMetrics,
      recentActions: recentBounties,
      profileHistory: [],
      percentiles: null,
      egoGraph: null,
      coordinationFlags: [],
    });
  }

  // Forum profile: keep existing behavior.
  const recentActions = await db.query.actions.findMany({
    where: eq(actions.agentId, id),
    orderBy: [desc(actions.performedAt)],
    limit: 20,
    with: {
      enrichment: true,
    },
  });

  const profileHistory = await db.query.agentProfiles.findMany({
    where: eq(agentProfiles.agentId, id),
    orderBy: [desc(agentProfiles.snapshotAt)],
    limit: 50,
  });

  const totalAgentCount = await db.select({ count: count(agents.id) }).from(agents);
  const total = Number(totalAgentCount[0]?.count) || 1;

  const [influencePercentile, autonomyPercentile, activityPercentile] =
    await Promise.all([
      db
        .select({ count: count(agents.id) })
        .from(agents)
        .where(sql`${agents.influenceScore} <= ${agent.influenceScore ?? 0}`),
      db
        .select({ count: count(agents.id) })
        .from(agents)
        .where(sql`${agents.autonomyScore} <= ${agent.autonomyScore ?? 0}`),
      db
        .select({ count: count(agents.id) })
        .from(agents)
        .where(sql`${agents.activityScore} <= ${agent.activityScore ?? 0}`),
    ]);

  const percentiles = {
    influence: Math.round((Number(influencePercentile[0]?.count) / total) * 100),
    autonomy: Math.round((Number(autonomyPercentile[0]?.count) / total) * 100),
    activity: Math.round((Number(activityPercentile[0]?.count) / total) * 100),
  };

  const outgoing = await db
    .select({
      targetId: interactions.targetAgentId,
      weight: sql<number>`SUM(${interactions.weight})`.as("weight"),
      count: count(interactions.id).as("count"),
    })
    .from(interactions)
    .where(eq(interactions.sourceAgentId, id))
    .groupBy(interactions.targetAgentId)
    .orderBy(sql`SUM(${interactions.weight}) DESC`)
    .limit(10);

  const incoming = await db
    .select({
      sourceId: interactions.sourceAgentId,
      weight: sql<number>`SUM(${interactions.weight})`.as("weight"),
      count: count(interactions.id).as("count"),
    })
    .from(interactions)
    .where(eq(interactions.targetAgentId, id))
    .groupBy(interactions.sourceAgentId)
    .orderBy(sql`SUM(${interactions.weight}) DESC`)
    .limit(10);

  const neighborIds = [
    ...new Set([...outgoing.map((o) => o.targetId), ...incoming.map((i) => i.sourceId)]),
  ];
  const neighborAgents =
    neighborIds.length > 0
      ? await db.query.agents.findMany({
          where: inArray(agents.id, neighborIds),
        })
      : [];

  const egoGraph = {
    outgoing: outgoing.map((o) => ({
      ...o,
      displayName:
        neighborAgents.find((a) => a.id === o.targetId)?.displayName || "Unknown",
    })),
    incoming: incoming.map((i) => ({
      ...i,
      displayName:
        neighborAgents.find((a) => a.id === i.sourceId)?.displayName || "Unknown",
    })),
  };

  const coordFlags = await db
    .select()
    .from(coordinationSignals)
    .where(
      sql`${coordinationSignals.agentIds}::jsonb @> ${JSON.stringify([id])}::jsonb`
    )
    .orderBy(desc(coordinationSignals.detectedAt))
    .limit(5);

  return NextResponse.json({
    actorKind: "ai",
    profileVariant: "forum_ai",
    sourceProfileType: "forum_ai",
    displayLabel,
    agent: {
      ...agent,
      displayLabel,
    },
    recentActions,
    profileHistory,
    percentiles,
    egoGraph,
    coordinationFlags: coordFlags,
  });
}
