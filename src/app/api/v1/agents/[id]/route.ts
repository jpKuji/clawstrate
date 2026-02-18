import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  agents,
  actions,
  agentProfiles,
  interactions,
  coordinationSignals,
  erc8004AgentMetadata,
  erc8004Agents,
  erc8004Feedbacks,
  erc8004Validations,
} from "@/lib/db/schema";
import { eq, desc, sql, count, inArray, and } from "drizzle-orm";
import {
  actorKindFromRawProfile,
  formatAgentDisplayLabel,
  resolveActorKind,
  sourceProfileTypeFromPlatforms,
} from "@/lib/agents/classify";
import { computeMarketplaceAgentMetrics } from "@/lib/pipeline/analyze";
import { extractRows } from "@/lib/onchain/api-utils";

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDateIso(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function parseOnchainAgentId(id: string): string | null {
  if (!id.startsWith("onchain:")) return null;
  const key = id.slice("onchain:".length).trim();
  return key.length > 0 ? key : null;
}

async function getOnchainAgentPayload(agentKey: string) {
  const [agent] = await db
    .select({
      agentKey: erc8004Agents.agentKey,
      chainId: erc8004Agents.chainId,
      registryAddress: erc8004Agents.registryAddress,
      agentId: erc8004Agents.agentId,
      ownerAddress: erc8004Agents.ownerAddress,
      agentUri: erc8004Agents.agentUri,
      agentWallet: erc8004Agents.agentWallet,
      isActive: erc8004Agents.isActive,
      createdAt: erc8004Agents.createdAt,
      updatedAt: erc8004Agents.updatedAt,
      name: erc8004AgentMetadata.name,
      description: erc8004AgentMetadata.description,
      protocols: erc8004AgentMetadata.protocols,
      x402Supported: erc8004AgentMetadata.x402Supported,
      parseStatus: erc8004AgentMetadata.parseStatus,
      serviceEndpoints: erc8004AgentMetadata.serviceEndpointsJson,
      crossChain: erc8004AgentMetadata.crossChainJson,
    })
    .from(erc8004Agents)
    .leftJoin(erc8004AgentMetadata, eq(erc8004AgentMetadata.agentKey, erc8004Agents.agentKey))
    .where(eq(erc8004Agents.agentKey, agentKey))
    .limit(1);

  if (!agent) return null;

  const [totals, activityByDay, recentEventsResult, feedbackCount, validationCount, counterparties] =
    await Promise.all([
      db.execute<{
        total_events: number;
        events_24h: number;
        unique_event_types: number;
        proactive_events: number;
        reactive_events: number;
      }>(sql`
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE oea.block_time >= NOW() - INTERVAL '24 hours')::int AS events_24h,
          COUNT(DISTINCT oel.event_name)::int AS unique_event_types,
          COUNT(*) FILTER (
            WHERE oel.event_name IN (
              'Registered',
              'URIUpdated',
              'AgentWalletSet',
              'ValidationResponse',
              'CoordinationProposed',
              'CoordinationExecuted'
            )
          )::int AS proactive_events,
          COUNT(*) FILTER (
            WHERE oel.event_name IN (
              'NewFeedback',
              'FeedbackRevoked',
              'ValidationRequest',
              'ResponseAppended'
            )
          )::int AS reactive_events
        FROM onchain_event_agents oea
        LEFT JOIN onchain_event_logs oel
          ON oel.chain_id = oea.chain_id
          AND oel.tx_hash = oea.tx_hash
          AND oel.log_index = oea.log_index
        WHERE oea.agent_key = ${agentKey}
      `),
      db.execute<{
        day: string;
        events: number;
        proactive_events: number;
        reactive_events: number;
      }>(sql`
        SELECT
          DATE_TRUNC('day', oea.block_time)::date::text AS day,
          COUNT(*)::int AS events,
          COUNT(*) FILTER (
            WHERE oel.event_name IN (
              'Registered',
              'URIUpdated',
              'AgentWalletSet',
              'ValidationResponse',
              'CoordinationProposed',
              'CoordinationExecuted'
            )
          )::int AS proactive_events,
          COUNT(*) FILTER (
            WHERE oel.event_name IN (
              'NewFeedback',
              'FeedbackRevoked',
              'ValidationRequest',
              'ResponseAppended'
            )
          )::int AS reactive_events
        FROM onchain_event_agents oea
        LEFT JOIN onchain_event_logs oel
          ON oel.chain_id = oea.chain_id
          AND oel.tx_hash = oea.tx_hash
          AND oel.log_index = oea.log_index
        WHERE oea.agent_key = ${agentKey}
        GROUP BY DATE_TRUNC('day', oea.block_time)::date
        ORDER BY day DESC
        LIMIT 30
      `),
      db.execute<{
        chain_id: number;
        tx_hash: string;
        log_index: number;
        block_time: Date;
        standard: string;
        event_name: string;
        topic_slugs: string[] | null;
      }>(sql`
        SELECT
          oel.chain_id,
          oel.tx_hash,
          oel.log_index,
          oel.block_time,
          oel.standard,
          oel.event_name,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT oet.topic_slug), NULL) AS topic_slugs
        FROM onchain_event_agents oea
        INNER JOIN onchain_event_logs oel
          ON oel.chain_id = oea.chain_id
          AND oel.tx_hash = oea.tx_hash
          AND oel.log_index = oea.log_index
        LEFT JOIN onchain_event_topics oet
          ON oet.chain_id = oel.chain_id
          AND oet.tx_hash = oel.tx_hash
          AND oet.log_index = oel.log_index
        WHERE oea.agent_key = ${agentKey}
        GROUP BY oel.chain_id, oel.tx_hash, oel.log_index, oel.block_time, oel.standard, oel.event_name
        ORDER BY oel.block_time DESC, oel.log_index DESC
        LIMIT 30
      `),
      db
        .select({ count: count(erc8004Feedbacks.feedbackKey) })
        .from(erc8004Feedbacks)
        .where(eq(erc8004Feedbacks.agentKey, agentKey)),
      db
        .select({ count: count(erc8004Validations.requestHash) })
        .from(erc8004Validations)
        .where(and(eq(erc8004Validations.agentKey, agentKey), eq(erc8004Validations.status, "responded"))),
      db.execute<{ address: string; role: string; count: number }>(sql`
        SELECT
          addr AS address,
          role,
          COUNT(*)::int AS count
        FROM (
          SELECT client_address AS addr, 'feedback_client'::text AS role
          FROM erc8004_feedbacks
          WHERE agent_key = ${agentKey}
          UNION ALL
          SELECT validator_address AS addr, 'validator'::text AS role
          FROM erc8004_validations
          WHERE agent_key = ${agentKey} AND validator_address IS NOT NULL
        ) AS pairs
        WHERE addr IS NOT NULL
        GROUP BY addr, role
        ORDER BY count DESC
        LIMIT 20
      `),
    ]);

  const totalsRow = extractRows<{
    total_events: number;
    events_24h: number;
    unique_event_types: number;
    proactive_events: number;
    reactive_events: number;
  }>(totals)[0];

  const totalEvents = asNumber(totalsRow?.total_events);
  const events24h = asNumber(totalsRow?.events_24h);
  const uniqueEventTypes = asNumber(totalsRow?.unique_event_types);
  const proactiveEvents = asNumber(totalsRow?.proactive_events);
  const reactiveEvents = asNumber(totalsRow?.reactive_events);

  const influenceRaw = events24h * 3 + totalEvents * 0.2 + uniqueEventTypes * 1.5;
  const activityRaw = events24h + Math.min(totalEvents, 72) * 0.1;
  const autonomyDenominator = proactiveEvents + reactiveEvents;

  const influenceScore = Math.min(influenceRaw / 100, 1);
  const activityScore = Math.min(activityRaw / 60, 1);
  const autonomyScore =
    autonomyDenominator > 0
      ? Math.min(Math.max(proactiveEvents / autonomyDenominator, 0), 1)
      : 0.5;

  const displayName = (agent.name || agent.agentKey).trim();
  const displayLabel = displayName;

  const historyRows = extractRows<{
    day: string;
    events: number;
    proactive_events: number;
    reactive_events: number;
  }>(activityByDay);
  const profileHistory = historyRows.map((row) => {
    const events = asNumber(row.events);
    const proactive = asNumber(row.proactive_events);
    const reactive = asNumber(row.reactive_events);
    const denom = proactive + reactive;
    return {
      snapshotAt: new Date(`${row.day}T00:00:00.000Z`).toISOString(),
      influenceScore: Math.min((events * 3 + events * 0.2) / 100, 1),
      autonomyScore: denom > 0 ? Math.min(Math.max(proactive / denom, 0), 1) : 0.5,
      activityScore: Math.min(events / 20, 1),
    };
  });

  const recentEvents = extractRows<{
    chain_id: number;
    tx_hash: string;
    log_index: number;
    block_time: Date;
    standard: string;
    event_name: string;
    topic_slugs: string[] | null;
  }>(recentEventsResult).map((row) => ({
    id: `${row.chain_id}:${row.tx_hash}:${row.log_index}`,
    actionType: row.event_name,
    title: `${row.standard.toUpperCase()} ${row.event_name}`,
    content: null,
    performedAt: asDateIso(row.block_time, new Date().toISOString()),
    upvotes: null,
    topics: Array.isArray(row.topic_slugs) ? row.topic_slugs : [],
    chainId: row.chain_id,
    txHash: row.tx_hash,
    standard: row.standard,
  }));

  return {
    actorKind: "ai",
    profileVariant: "onchain_ai",
    sourceProfileType: "onchain_ai",
    displayLabel,
    agent: {
      id: `onchain:${agent.agentKey}`,
      displayName,
      displayLabel,
      description: agent.description,
      influenceScore,
      autonomyScore,
      activityScore,
      agentType: "onchain_agent",
      totalActions: totalEvents,
      firstSeenAt: asDateIso(agent.createdAt, new Date().toISOString()),
      lastSeenAt: asDateIso(agent.updatedAt, new Date().toISOString()),
      metadata: {
        agentKey: agent.agentKey,
        chainId: agent.chainId,
        registryAddress: agent.registryAddress,
        agentId: agent.agentId,
        ownerAddress: agent.ownerAddress,
        agentWallet: agent.agentWallet,
        agentUri: agent.agentUri,
        isActive: agent.isActive,
        serviceEndpoints: agent.serviceEndpoints,
        crossChain: agent.crossChain,
      },
    },
    onchainMetrics: {
      feedbacks: Number(feedbackCount[0]?.count ?? 0),
      validations: Number(validationCount[0]?.count ?? 0),
      uniqueCounterparties: extractRows<{ address: string; role: string; count: number }>(counterparties).length,
      protocols: Array.isArray(agent.protocols) ? agent.protocols : [],
      x402Supported: agent.x402Supported,
      parseStatus: agent.parseStatus,
    },
    recentEvents,
    profileHistory,
    counterpartyActivity: extractRows<{ address: string; role: string; count: number }>(counterparties).map((row) => ({
      address: row.address,
      role: row.role,
      count: asNumber(row.count),
    })),
    coordinationFlags: [],
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const onchainKey = parseOnchainAgentId(id);
  if (onchainKey) {
    const payload = await getOnchainAgentPayload(onchainKey);
    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
  }

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
