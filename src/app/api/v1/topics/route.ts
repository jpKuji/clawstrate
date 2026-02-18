import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { topics, actionTopics, actions } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";
import { extractRows } from "@/lib/onchain/api-utils";

type SortBy = "velocity" | "actions" | "agents" | "recent";
const SORT_BY_VALUES: SortBy[] = ["velocity", "actions", "agents", "recent"];

type TopicRow = {
  id: string;
  slug: string;
  name: string;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
  lastSeenAt?: string | Date | null;
};

function parseCachedRows<T>(cached: T | string | null): T | null {
  if (!cached) return null;
  if (typeof cached !== "string") return cached;

  try {
    return JSON.parse(cached) as T;
  } catch (error) {
    console.warn("Ignoring malformed cache payload for topics list", error);
    return null;
  }
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSortBy(raw: string | null): SortBy {
  const candidate = (raw || "").toLowerCase() as SortBy;
  return SORT_BY_VALUES.includes(candidate) ? candidate : "velocity";
}

function parseLimit(raw: string | null, fallback = 50): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 100);
}

function compareTopics(a: TopicRow, b: TopicRow, sortBy: SortBy): number {
  if (sortBy === "actions") return (b.actionCount ?? 0) - (a.actionCount ?? 0);
  if (sortBy === "agents") return (b.agentCount ?? 0) - (a.agentCount ?? 0);
  if (sortBy === "recent") {
    const aTime = asDate(a.lastSeenAt)?.getTime() ?? 0;
    const bTime = asDate(b.lastSeenAt)?.getTime() ?? 0;
    return bTime - aTime;
  }
  return (b.velocity ?? 0) - (a.velocity ?? 0);
}

async function fetchCanonicalTopics(input: {
  source: string;
  sortBy: SortBy;
  limit: number;
}): Promise<TopicRow[]> {
  if (input.source === "onchain") return [];

  const sortMap: Record<SortBy, any> = {
    velocity: topics.velocity,
    actions: topics.actionCount,
    agents: topics.agentCount,
    recent: topics.lastSeenAt,
  };

  try {
    return await db.query.topics.findMany({
      where:
        input.source === "all"
          ? undefined
          : sql`EXISTS (
              SELECT 1
              FROM ${actionTopics}
              INNER JOIN ${actions}
                ON ${actions.id} = ${actionTopics.actionId}
              WHERE ${actionTopics.topicId} = ${topics.id}
                AND ${actions.platformId} = ${input.source}
            )`,
      orderBy: [desc(sortMap[input.sortBy] || topics.velocity)],
      limit: input.limit,
    });
  } catch (error) {
    if (input.source === "all") throw error;
    console.warn(
      `Source-filtered topics query failed for source="${input.source}". Falling back to unfiltered topics.`,
      error
    );
    return db.query.topics.findMany({
      orderBy: [desc(sortMap[input.sortBy] || topics.velocity)],
      limit: input.limit,
    });
  }
}

async function fetchOnchainTopics(limit: number): Promise<TopicRow[]> {
  try {
    const result = await db.execute<{
      topic_slug: string;
      topic_name: string;
      velocity: number;
      action_count: number;
      agent_count: number;
      last_seen_at: Date;
    }>(sql`
      SELECT
        oet.topic_slug,
        MAX(oet.topic_name) AS topic_name,
        (COUNT(*) FILTER (WHERE oet.block_time >= NOW() - INTERVAL '24 hours')::real / 24.0) AS velocity,
        COUNT(*)::int AS action_count,
        COUNT(DISTINCT oa.agent_key)::int AS agent_count,
        MAX(oet.block_time) AS last_seen_at
      FROM onchain_event_topics oet
      LEFT JOIN onchain_event_agents oea
        ON oea.chain_id = oet.chain_id
        AND oea.tx_hash = oet.tx_hash
        AND oea.log_index = oet.log_index
      LEFT JOIN erc8004_agents oa
        ON oa.agent_key = oea.agent_key
      GROUP BY oet.topic_slug
      ORDER BY MAX(oet.block_time) DESC
      LIMIT ${Math.max(limit, 1)}
    `);

    return extractRows<{
      topic_slug: string;
      topic_name: string;
      velocity: number;
      action_count: number;
      agent_count: number;
      last_seen_at: Date;
    }>(result).map((row) => ({
      id: `onchain:${row.topic_slug}`,
      slug: row.topic_slug,
      name: row.topic_name || row.topic_slug,
      velocity: asNumber(row.velocity),
      actionCount: asNumber(row.action_count),
      agentCount: asNumber(row.agent_count),
      avgSentiment: null,
      lastSeenAt: row.last_seen_at,
    }));
  } catch (error) {
    console.warn("Onchain topic query failed; returning canonical topics only.", error);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const sortBy = parseSortBy(searchParams.get("sort"));
  const source = searchParams.get("source") || "all";

  const cacheKey = `topics:${sortBy}:${limit}:${source}:v2`;
  const cached = await cacheGet<TopicRow[] | string>(cacheKey);
  const cachedRows = parseCachedRows<TopicRow[]>(cached);
  if (cachedRows) {
    return NextResponse.json(cachedRows);
  }

  const mergedSourceFetchLimit = Math.min(limit * 3, 300);
  const canonicalFetchLimit = source === "all" ? mergedSourceFetchLimit : limit;
  const onchainFetchLimit = Math.max(mergedSourceFetchLimit, 150);
  const includeCanonical = source !== "onchain";
  const includeOnchain = source === "all" || source === "onchain";

  const [canonicalRows, onchainRows] = await Promise.all([
    includeCanonical
      ? fetchCanonicalTopics({ source, sortBy, limit: canonicalFetchLimit })
      : Promise.resolve([]),
    includeOnchain ? fetchOnchainTopics(onchainFetchLimit) : Promise.resolve([]),
  ]);

  let merged: TopicRow[] = [];

  if (source === "all") {
    const bySlug = new Map<string, TopicRow>();

    for (const row of canonicalRows) {
      bySlug.set(row.slug, {
        ...row,
        lastSeenAt: row.lastSeenAt ?? null,
      });
    }

    for (const row of onchainRows) {
      const existing = bySlug.get(row.slug);
      if (!existing) {
        bySlug.set(row.slug, row);
        continue;
      }

      const existingLast = asDate(existing.lastSeenAt)?.getTime() ?? 0;
      const currentLast = asDate(row.lastSeenAt)?.getTime() ?? 0;

      bySlug.set(row.slug, {
        ...existing,
        name: existing.name || row.name,
        velocity: (existing.velocity ?? 0) + (row.velocity ?? 0),
        actionCount: (existing.actionCount ?? 0) + (row.actionCount ?? 0),
        agentCount: (existing.agentCount ?? 0) + (row.agentCount ?? 0),
        lastSeenAt: currentLast > existingLast ? row.lastSeenAt : existing.lastSeenAt,
      });
    }

    merged = Array.from(bySlug.values());
  } else {
    merged = source === "onchain" ? onchainRows : canonicalRows;
  }

  merged.sort((a, b) => compareTopics(a, b, sortBy));
  const response = merged.slice(0, limit);

  await cacheSet(cacheKey, response, 120);

  return NextResponse.json(response);
}
