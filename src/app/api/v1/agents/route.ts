import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentIdentities } from "@/lib/db/schema";
import { sql, inArray, asc, desc } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";
import {
  actorKindFromRawProfile,
  formatAgentDisplayLabel,
  resolveActorKind,
  sourceProfileTypeFromPlatforms,
  type SourceProfileType,
} from "@/lib/agents/classify";
import { extractRows } from "@/lib/onchain/api-utils";

type SortBy = "influence" | "autonomy" | "activity" | "recent" | "actions";
type SortOrder = "asc" | "desc";
const SORT_BY_VALUES: SortBy[] = ["influence", "autonomy", "activity", "recent", "actions"];
const SORT_ORDER_VALUES: SortOrder[] = ["asc", "desc"];
const ONCHAIN_INFLUENCE_MAX = 80;
const ONCHAIN_ACTIVITY_MAX = 24;

interface AgentListRow {
  id: string;
  displayName: string;
  displayLabel?: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  agentType: string | null;
  totalActions: number | null;
  lastSeenAt: string;
  platformIds?: string[];
  actorKind?: string;
  sourceProfileType?: SourceProfileType;
  description?: string | null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseSortBy(raw: string | null): SortBy {
  const candidate = (raw || "").toLowerCase() as SortBy;
  return SORT_BY_VALUES.includes(candidate) ? candidate : "influence";
}

function parseSortOrder(raw: string | null): SortOrder {
  const candidate = (raw || "").toLowerCase() as SortOrder;
  return SORT_ORDER_VALUES.includes(candidate) ? candidate : "desc";
}

function parseLimit(raw: string | null, fallback = 50): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 100);
}

function asDateIso(value: unknown, fallback = new Date(0).toISOString()): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function safeAgentType(input: string | null, totalActions: number, autonomy: number): string {
  if (input) return input;
  if (totalActions > 80 && autonomy < 0.2) return "bot_farm";
  if (totalActions > 100) return "active";
  if (totalActions > 20) return "rising";
  return "lurker";
}

function compareAgentRows(a: AgentListRow, b: AgentListRow, sortBy: SortBy, order: SortOrder): number {
  const direction = order === "asc" ? 1 : -1;

  const getMetric = (row: AgentListRow): number => {
    if (sortBy === "recent") return new Date(row.lastSeenAt).getTime();
    if (sortBy === "actions") return row.totalActions ?? 0;
    if (sortBy === "autonomy") return row.autonomyScore ?? 0;
    if (sortBy === "activity") return row.activityScore ?? 0;
    return row.influenceScore ?? 0;
  };

  const delta = getMetric(a) - getMetric(b);
  if (delta !== 0) return delta * direction;
  return a.displayName.localeCompare(b.displayName) * direction;
}

async function fetchCanonicalAgents(input: {
  limit: number;
  source: string;
  actor: "ai" | "all";
  sortBy: SortBy;
  order: SortOrder;
}): Promise<AgentListRow[]> {
  if (input.source === "onchain") return [];

  const aiOnlyFilter = sql`NOT EXISTS (
    SELECT 1 FROM agent_identities ai
    WHERE ai.agent_id = ${agents.id}
      AND (ai.raw_profile->>'actorKind') = 'human'
  )`;

  const actorFilter = input.actor === "all" ? sql`TRUE` : aiOnlyFilter;

  const whereSql =
    input.source === "all"
      ? actorFilter
      : sql`EXISTS (
          SELECT 1 FROM agent_identities ai
          WHERE ai.agent_id = ${agents.id}
            AND ai.platform_id = ${input.source}
        ) AND ${actorFilter}`;

  const rows = await db.query.agents.findMany({
    where: whereSql,
    orderBy: [(() => {
      const sortMap: Record<SortBy, any> = {
        influence: agents.influenceScore,
        autonomy: agents.autonomyScore,
        activity: agents.activityScore,
        recent: agents.lastSeenAt,
        actions: agents.totalActions,
      };
      const field = sortMap[input.sortBy] || agents.influenceScore;
      return input.order === "asc" ? asc(field) : desc(field);
    })()],
    limit: input.limit,
  });

  const agentIds = rows.map((row) => row.id);
  const identities =
    agentIds.length > 0
      ? await db
          .select({
            agentId: agentIdentities.agentId,
            platformId: agentIdentities.platformId,
            platformUserId: agentIdentities.platformUserId,
            rawProfile: agentIdentities.rawProfile,
          })
          .from(agentIdentities)
          .where(inArray(agentIdentities.agentId, agentIds))
      : [];

  const identityMap = new Map<string, typeof identities>();
  for (const identity of identities) {
    const existing = identityMap.get(identity.agentId) ?? [];
    existing.push(identity);
    identityMap.set(identity.agentId, existing);
  }

  return rows.map((row) => {
    const linkedIdentities = identityMap.get(row.id) ?? [];
    const platformIds = Array.from(new Set(linkedIdentities.map((item) => item.platformId)));
    const actorKind = resolveActorKind(
      linkedIdentities.map((item) => actorKindFromRawProfile(item.rawProfile))
    );
    const sourceProfileType = sourceProfileTypeFromPlatforms(platformIds);
    const preferredIdentity =
      (input.source !== "all"
        ? linkedIdentities.find((item) => item.platformId === input.source)
        : undefined) ||
      linkedIdentities.find((item) => item.platformId === "rentahuman") ||
      linkedIdentities[0];

    return {
      ...row,
      displayLabel: formatAgentDisplayLabel({
        displayName: row.displayName,
        platformId: preferredIdentity?.platformId,
        platformUserId: preferredIdentity?.platformUserId,
      }),
      platformIds,
      actorKind,
      sourceProfileType,
      lastSeenAt: asDateIso(row.lastSeenAt),
    };
  });
}

async function fetchOnchainAgents(limit: number): Promise<AgentListRow[]> {
  const rowsResult = await db.execute(sql`
    SELECT
      a.agent_key,
      a.chain_id,
      a.owner_address,
      a.agent_wallet,
      a.created_at,
      a.updated_at,
      COALESCE(NULLIF(TRIM(m.name), ''), a.agent_key) AS display_name,
      m.description,
      COUNT(oea.id)::int AS total_events,
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
    FROM erc8004_agents a
    LEFT JOIN erc8004_agent_metadata m
      ON m.agent_key = a.agent_key
    LEFT JOIN onchain_event_agents oea
      ON oea.agent_key = a.agent_key
    LEFT JOIN onchain_event_logs oel
      ON oel.chain_id = oea.chain_id
      AND oel.tx_hash = oea.tx_hash
      AND oel.log_index = oea.log_index
    GROUP BY
      a.agent_key,
      a.chain_id,
      a.owner_address,
      a.agent_wallet,
      a.created_at,
      a.updated_at,
      m.name,
      m.description
    ORDER BY a.updated_at DESC
    LIMIT ${Math.max(limit, 1)}
  `);

  const rows = extractRows<Record<string, unknown>>(rowsResult);
  if (rows.length === 0) return [];

  const enriched = rows.map((row) => {
    const totalEvents = asNumber(row.total_events);
    const events24h = asNumber(row.events_24h);
    const uniqueEventTypes = asNumber(row.unique_event_types);
    const proactiveEvents = asNumber(row.proactive_events);
    const reactiveEvents = asNumber(row.reactive_events);

    const rawInfluence = events24h * 3 + totalEvents * 0.2 + uniqueEventTypes * 1.5;
    const rawActivity = events24h + Math.min(totalEvents, 72) * 0.1;
    const autonomyDenominator = proactiveEvents + reactiveEvents;
    const autonomy = autonomyDenominator > 0 ? proactiveEvents / autonomyDenominator : 0.5;

    return {
      row,
      totalEvents,
      rawInfluence,
      rawActivity,
      autonomy,
    };
  });

  return enriched.map((item) => {
    const agentKey = String(item.row.agent_key);
    const displayName = String(item.row.display_name || agentKey);

    return {
      id: `onchain:${agentKey}`,
      displayName,
      displayLabel: displayName,
      influenceScore: clamp01(item.rawInfluence / ONCHAIN_INFLUENCE_MAX),
      autonomyScore: clamp01(item.autonomy),
      activityScore: clamp01(item.rawActivity / ONCHAIN_ACTIVITY_MAX),
      agentType: safeAgentType(null, item.totalEvents, item.autonomy),
      totalActions: item.totalEvents,
      lastSeenAt: asDateIso(item.row.updated_at),
      platformIds: ["onchain"],
      actorKind: "ai",
      sourceProfileType: "onchain_ai",
      description: typeof item.row.description === "string" ? item.row.description : null,
    };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const sortBy = parseSortBy(searchParams.get("sort"));
  const order = parseSortOrder(searchParams.get("order"));
  const source = searchParams.get("source") || "all";
  const actor = searchParams.get("actor") === "all" ? "all" : "ai";

  const cacheKey = `agents:${sortBy}:${order}:${limit}:${source}:${actor}:v2`;
  const cached = await cacheGet<AgentListRow[] | string>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  try {
    const mergedSourceFetchLimit = Math.min(limit * 3, 300);
    const canonicalFetchLimit = source === "all" ? mergedSourceFetchLimit : limit;
    const onchainFetchLimit = Math.max(mergedSourceFetchLimit, 150);
    const includeCanonical = source !== "onchain";
    const includeOnchain = source === "all" || source === "onchain";

    const [canonicalRows, onchainRows] = await Promise.all([
      includeCanonical
        ? fetchCanonicalAgents({ limit: canonicalFetchLimit, source, actor, sortBy, order })
        : Promise.resolve([]),
      includeOnchain ? fetchOnchainAgents(onchainFetchLimit) : Promise.resolve([]),
    ]);

    const merged = [...canonicalRows, ...onchainRows];
    merged.sort((a, b) => compareAgentRows(a, b, sortBy, order));

    const results = merged.slice(0, limit);

    await cacheSet(cacheKey, results, 60);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json([], { status: 500 });
  }
}
