import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, actions, enrichments, agentProfiles, interactions, coordinationSignals } from "@/lib/db/schema";
import { eq, desc, sql, count, inArray } from "drizzle-orm";

export async function GET(
  req: NextRequest,
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

  // Detect actor kind from identity rawProfile
  const actorKind = agent.identities?.find(
    (i: any) => (i.rawProfile as any)?.actorKind
  )?.rawProfile?.actorKind || "ai";

  if (actorKind === "human") {
    const profile = agent.identities?.find(
      (i: any) => (i.rawProfile as any)?.actorKind === "human"
    )?.rawProfile || {};

    // Their actions are assignment comments — join with parent bounty posts
    const assignments = await db.query.actions.findMany({
      where: eq(actions.agentId, id),
      orderBy: [desc(actions.performedAt)],
      limit: 50,
    });

    // Fetch parent bounty details
    const parentIds = assignments.map(a => a.parentActionId).filter(Boolean) as string[];
    const bountyPosts = parentIds.length > 0
      ? await db.query.actions.findMany({ where: inArray(actions.id, parentIds) })
      : [];
    const bountyMap = new Map(bountyPosts.map(b => [b.id, b]));

    // Get bounty creator display names
    const creatorIds = [...new Set(bountyPosts.map(b => b.agentId).filter(Boolean))] as string[];
    const creators = creatorIds.length > 0
      ? await db.query.agents.findMany({ where: inArray(agents.id, creatorIds) })
      : [];
    const creatorMap = new Map(creators.map(c => [c.id, c]));

    const enrichedAssignments = assignments.map(a => {
      const bounty = a.parentActionId ? bountyMap.get(a.parentActionId) : null;
      const creator = bounty?.agentId ? creatorMap.get(bounty.agentId) : null;
      return {
        id: a.id,
        performedAt: a.performedAt,
        bounty: bounty ? {
          title: bounty.title,
          category: (bounty.rawData as any)?.category,
          price: (bounty.rawData as any)?.price,
          priceType: (bounty.rawData as any)?.priceType,
          currency: (bounty.rawData as any)?.currency,
          skillsNeeded: (bounty.rawData as any)?.skillsNeeded,
          url: bounty.url,
          creatorName: creator?.displayName || "Unknown",
          creatorId: creator?.id,
        } : null,
      };
    });

    return NextResponse.json({
      actorKind: "human",
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        description: agent.description,
        firstSeenAt: agent.firstSeenAt,
        lastSeenAt: agent.lastSeenAt,
        totalActions: agent.totalActions,
      },
      profile,
      assignments: enrichedAssignments,
    });
  }

  // Recent actions
  const recentActions = await db.query.actions.findMany({
    where: eq(actions.agentId, id),
    orderBy: [desc(actions.performedAt)],
    limit: 20,
    with: {
      enrichment: true,
    },
  });

  // Profile history (for trend charts)
  const profileHistory = await db.query.agentProfiles.findMany({
    where: eq(agentProfiles.agentId, id),
    orderBy: [desc(agentProfiles.snapshotAt)],
    limit: 50,
  });

  // Compute percentiles
  const totalAgentCount = await db.select({ count: count(agents.id) }).from(agents);
  const total = Number(totalAgentCount[0]?.count) || 1;

  const [influencePercentile, autonomyPercentile, activityPercentile] = await Promise.all([
    db.select({ count: count(agents.id) }).from(agents)
      .where(sql`${agents.influenceScore} <= ${agent.influenceScore ?? 0}`),
    db.select({ count: count(agents.id) }).from(agents)
      .where(sql`${agents.autonomyScore} <= ${agent.autonomyScore ?? 0}`),
    db.select({ count: count(agents.id) }).from(agents)
      .where(sql`${agents.activityScore} <= ${agent.activityScore ?? 0}`),
  ]);

  const percentiles = {
    influence: Math.round((Number(influencePercentile[0]?.count) / total) * 100),
    autonomy: Math.round((Number(autonomyPercentile[0]?.count) / total) * 100),
    activity: Math.round((Number(activityPercentile[0]?.count) / total) * 100),
  };

  // Ego graph — agents this agent interacts with
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

  // Get display names for neighbors
  const neighborIds = [...new Set([...outgoing.map(o => o.targetId), ...incoming.map(i => i.sourceId)])];
  const neighborAgents = neighborIds.length > 0
    ? await db.query.agents.findMany({
        where: inArray(agents.id, neighborIds),
      })
    : [];

  const egoGraph = {
    outgoing: outgoing.map(o => ({
      ...o,
      displayName: neighborAgents.find(a => a.id === o.targetId)?.displayName || "Unknown",
    })),
    incoming: incoming.map(i => ({
      ...i,
      displayName: neighborAgents.find(a => a.id === i.sourceId)?.displayName || "Unknown",
    })),
  };

  // Coordination flags
  const coordFlags = await db
    .select()
    .from(coordinationSignals)
    .where(sql`${coordinationSignals.agentIds}::jsonb @> ${JSON.stringify([id])}::jsonb`)
    .orderBy(desc(coordinationSignals.detectedAt))
    .limit(5);

  return NextResponse.json({
    actorKind: "ai",
    agent,
    recentActions,
    profileHistory,
    percentiles,
    egoGraph,
    coordinationFlags: coordFlags,
  });
}
