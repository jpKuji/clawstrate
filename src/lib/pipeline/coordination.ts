import { db } from "../db";
import {
  interactions,
  coordinationSignals,
} from "../db/schema";
import { gte, sql } from "drizzle-orm";
import { subDays, subHours } from "date-fns";
import { createHash } from "crypto";
import {
  getBootstrapStart,
  getStageCursor,
  GLOBAL_CURSOR_SCOPE,
  setStageCursor,
} from "./cursors";
import { extractRows, toNumber, chunk } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_AGENT = 40;
const MAX_GROUP_SIZE = 16;

function stableHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function rollingUtcWindowStart(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() - days * DAY_MS);
}

function twoHourBucket(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  const currentHour = d.getUTCHours();
  d.setUTCHours(Math.floor(currentHour / 2) * 2);
  return d;
}

async function bulkInsertSignals(
  rows: Array<{
    signalType: "temporal_cluster" | "content_similarity" | "reply_clique";
    signalHash: string;
    windowStart: Date;
    windowEnd: Date;
    confidence: number;
    agentIds: string[];
    evidence: string;
  }>
): Promise<number> {
  let inserted = 0;
  for (const valueChunk of chunk(rows, 500)) {
    if (valueChunk.length === 0) continue;
    const result = await db
      .insert(coordinationSignals)
      .values(valueChunk)
      .onConflictDoNothing({
        target: [
          coordinationSignals.signalType,
          coordinationSignals.signalHash,
          coordinationSignals.windowStart,
        ],
      })
      .returning({ id: coordinationSignals.id });
    inserted += result.length;
  }
  return inserted;
}

/**
 * Detect coordination patterns among agents.
 */
export async function detectCoordination(): Promise<{
  signalsDetected: number;
  errors: string[];
}> {
  const now = new Date();
  const cursor = await getStageCursor("coordination", GLOBAL_CURSOR_SCOPE);
  const cursorStart = cursor?.cursorTs ?? getBootstrapStart("coordination", now);

  const errors: string[] = [];
  let signalsDetected = 0;

  try {
    signalsDetected += await detectTemporalClustering(cursorStart, now);
  } catch (e: any) {
    errors.push(`temporal clustering: ${e.message}`);
  }

  try {
    signalsDetected += await detectContentSimilarity(now);
  } catch (e: any) {
    errors.push(`content similarity: ${e.message}`);
  }

  try {
    signalsDetected += await detectReplyCliques(now);
  } catch (e: any) {
    errors.push(`reply cliques: ${e.message}`);
  }

  if (errors.length === 0) {
    await setStageCursor("coordination", GLOBAL_CURSOR_SCOPE, now, {
      cursorStart: cursorStart.toISOString(),
      signalsDetected,
    });
  }

  return { signalsDetected, errors };
}

/**
 * Method 1: Temporal clustering
 * Detect 3+ unconnected agents posting on the same topic within a 2h window.
 */
async function detectTemporalClustering(cursorStart: Date, now: Date): Promise<number> {
  const last24h = subHours(now, 24);
  const scanStart = cursorStart > last24h ? cursorStart : last24h;

  const candidatesResult = await db.execute<{
    topic_id: string;
    topic_slug: string;
    bucket_start: Date;
    agent_ids: string[];
  }>(sql`
    SELECT
      at.topic_id,
      t.slug AS topic_slug,
      (
        DATE_TRUNC('hour', a.performed_at)
        - ((EXTRACT(HOUR FROM a.performed_at)::int % 2) * INTERVAL '1 hour')
      )::timestamp AS bucket_start,
      ARRAY_AGG(DISTINCT a.agent_id) FILTER (WHERE a.agent_id IS NOT NULL) AS agent_ids
    FROM action_topics at
    INNER JOIN actions a ON a.id = at.action_id
    INNER JOIN topics t ON t.id = at.topic_id
    WHERE a.performed_at >= ${scanStart}
      AND a.performed_at < ${now}
      AND a.agent_id IS NOT NULL
    GROUP BY at.topic_id, t.slug, bucket_start
    HAVING COUNT(DISTINCT a.agent_id) >= 3
  `);

  const candidates = extractRows<{
    topic_id: string;
    topic_slug: string;
    bucket_start: Date;
    agent_ids: string[];
  }>(candidatesResult);

  if (candidates.length === 0) return 0;

  const relevantAgentIds = Array.from(
    new Set(candidates.flatMap((candidate) => candidate.agent_ids || []))
  );

  const interactionRows =
    relevantAgentIds.length > 0
      ? await db
          .select({
            sourceAgentId: interactions.sourceAgentId,
            targetAgentId: interactions.targetAgentId,
          })
          .from(interactions)
          .where(
            sql`${interactions.sourceAgentId} = ANY(${relevantAgentIds}::uuid[]) AND ${interactions.targetAgentId} = ANY(${relevantAgentIds}::uuid[])`
          )
      : [];

  const directedPairs = new Set<string>();
  for (const row of interactionRows) {
    directedPairs.add(`${row.sourceAgentId}:${row.targetAgentId}`);
  }

  const newSignals: Array<{
    signalType: "temporal_cluster";
    signalHash: string;
    windowStart: Date;
    windowEnd: Date;
    confidence: number;
    agentIds: string[];
    evidence: string;
  }> = [];

  for (const candidate of candidates) {
    const agentIds = Array.from(new Set(candidate.agent_ids || [])).sort();
    if (agentIds.length < 3) continue;

    let interactionCount = 0;
    for (const source of agentIds) {
      for (const target of agentIds) {
        if (source === target) continue;
        if (directedPairs.has(`${source}:${target}`)) {
          interactionCount += 1;
        }
      }
    }

    const maxPossible = agentIds.length * (agentIds.length - 1);
    if (maxPossible <= 0) continue;

    const density = interactionCount / maxPossible;
    if (density >= 0.3) continue;

    const bucketStart = twoHourBucket(new Date(candidate.bucket_start));
    const bucketEnd = new Date(bucketStart.getTime() + 2 * 60 * 60 * 1000);
    const confidence = Math.min(0.5 + (agentIds.length - 3) * 0.1, 0.95);

    newSignals.push({
      signalType: "temporal_cluster",
      signalHash: stableHash({
        topicId: candidate.topic_id,
        bucketStart: bucketStart.toISOString(),
        agents: agentIds,
      }),
      windowStart: bucketStart,
      windowEnd: bucketEnd,
      confidence,
      agentIds,
      evidence: `${agentIds.length} weakly connected agents posted about "${candidate.topic_slug}" within one 2h bucket (${interactionCount}/${maxPossible} directed links).`,
    });
  }

  return bulkInsertSignals(newSignals);
}

/**
 * Method 2: Content similarity
 * Jaccard similarity > 0.8 on topic vectors over 7 days.
 */
async function detectContentSimilarity(now: Date): Promise<number> {
  const windowStart = rollingUtcWindowStart(now, 7);
  const windowEnd = new Date(windowStart.getTime() + 7 * DAY_MS);

  const pairsResult = await db.execute<{
    agent_id_1: string;
    agent_id_2: string;
    intersection_count: number;
    union_count: number;
    similarity: number;
  }>(sql`
    WITH agent_topics AS (
      SELECT DISTINCT a.agent_id, at.topic_id
      FROM action_topics at
      INNER JOIN actions a ON a.id = at.action_id
      WHERE a.agent_id IS NOT NULL
        AND a.performed_at >= ${windowStart}
        AND a.performed_at < ${windowEnd}
    ),
    topic_counts AS (
      SELECT agent_id, COUNT(*)::int AS topic_count
      FROM agent_topics
      GROUP BY agent_id
      HAVING COUNT(*) >= 3
    ),
    intersections AS (
      SELECT
        at1.agent_id AS agent_id_1,
        at2.agent_id AS agent_id_2,
        COUNT(*)::int AS intersection_count
      FROM agent_topics at1
      INNER JOIN agent_topics at2
        ON at1.topic_id = at2.topic_id
       AND at1.agent_id < at2.agent_id
      GROUP BY at1.agent_id, at2.agent_id
    )
    SELECT
      i.agent_id_1,
      i.agent_id_2,
      i.intersection_count,
      (tc1.topic_count + tc2.topic_count - i.intersection_count)::int AS union_count,
      (i.intersection_count::real / NULLIF((tc1.topic_count + tc2.topic_count - i.intersection_count), 0)::real) AS similarity
    FROM intersections i
    INNER JOIN topic_counts tc1 ON tc1.agent_id = i.agent_id_1
    INNER JOIN topic_counts tc2 ON tc2.agent_id = i.agent_id_2
    WHERE (i.intersection_count::real / NULLIF((tc1.topic_count + tc2.topic_count - i.intersection_count), 0)::real) > 0.8
  `);

  const pairs = extractRows<{
    agent_id_1: string;
    agent_id_2: string;
    intersection_count: number;
    union_count: number;
    similarity: number;
  }>(pairsResult);

  const signals = pairs.map((row) => {
    const sortedAgentIds = [row.agent_id_1, row.agent_id_2].sort();
    const similarity = toNumber(row.similarity, 0);
    const intersection = toNumber(row.intersection_count, 0);
    const union = toNumber(row.union_count, 0);
    return {
      signalType: "content_similarity" as const,
      signalHash: stableHash({
        agents: sortedAgentIds,
        intersection,
        union,
      }),
      windowStart,
      windowEnd,
      confidence: similarity,
      agentIds: sortedAgentIds,
      evidence: `Jaccard topic similarity ${similarity.toFixed(2)} over 7-day window (${intersection}/${union}).`,
    };
  });

  return bulkInsertSignals(signals);
}

/**
 * Method 3: Reply clique detection
 * Groups where > 80% of interactions are within the group.
 */
async function detectReplyCliques(now: Date): Promise<number> {
  const windowStart = rollingUtcWindowStart(now, 7);
  const windowEnd = new Date(windowStart.getTime() + 7 * DAY_MS);

  const recentInteractions = await db
    .select({
      sourceAgentId: interactions.sourceAgentId,
      targetAgentId: interactions.targetAgentId,
    })
    .from(interactions)
    .where(gte(interactions.createdAt, windowStart));

  const adjacency = new Map<string, Set<string>>();
  for (const inter of recentInteractions) {
    if (!adjacency.has(inter.sourceAgentId)) adjacency.set(inter.sourceAgentId, new Set());
    adjacency.get(inter.sourceAgentId)!.add(inter.targetAgentId);
  }

  const checkedGroups = new Set<string>();
  const signals: Array<{
    signalType: "reply_clique";
    signalHash: string;
    windowStart: Date;
    windowEnd: Date;
    confidence: number;
    agentIds: string[];
    evidence: string;
  }> = [];

  const allAgentIds = Array.from(adjacency.keys()).sort();
  for (const agentId of allAgentIds) {
    const partners = Array.from(adjacency.get(agentId) || []).sort();
    if (partners.length < 2) continue;

    const boundedPartners = partners.slice(0, MAX_CANDIDATES_PER_AGENT);
    const group = Array.from(new Set([agentId, ...boundedPartners])).slice(0, MAX_GROUP_SIZE);
    if (group.length < 3) continue;

    const groupKey = [...group].sort().join(",");
    if (checkedGroups.has(groupKey)) continue;
    checkedGroups.add(groupKey);

    const groupSet = new Set(group);
    let internalCount = 0;
    let totalCount = 0;

    for (const member of group) {
      const memberPartners = adjacency.get(member);
      if (!memberPartners) continue;
      for (const partner of memberPartners) {
        totalCount += 1;
        if (groupSet.has(partner)) internalCount += 1;
      }
    }

    if (totalCount === 0) continue;
    const ratio = internalCount / totalCount;
    if (ratio <= 0.8) continue;

    const confidence = Math.min(0.6 + (ratio - 0.8) * 2, 0.95);
    const sortedAgentIds = [...group].sort();

    signals.push({
      signalType: "reply_clique",
      signalHash: stableHash({
        agents: sortedAgentIds,
        internalCount,
        totalCount,
      }),
      windowStart,
      windowEnd,
      confidence,
      agentIds: sortedAgentIds,
      evidence: `${sortedAgentIds.length}-agent clique with ${(ratio * 100).toFixed(0)}% internal interactions (${internalCount}/${totalCount}).`,
    });
  }

  return bulkInsertSignals(signals);
}

/**
 * Label propagation community detection on the interaction graph.
 */
export async function detectCommunities(): Promise<{
  communitiesFound: number;
  agentsLabeled: number;
}> {
  const last14d = subDays(new Date(), 14);

  const allInteractions = await db
    .select({
      sourceAgentId: interactions.sourceAgentId,
      targetAgentId: interactions.targetAgentId,
      weight: interactions.weight,
    })
    .from(interactions)
    .where(gte(interactions.createdAt, last14d));

  const adjacency = new Map<string, Map<string, number>>();
  const allAgentIds = new Set<string>();

  const sortedInteractions = [...allInteractions].sort((a, b) => {
    const sourceCompare = a.sourceAgentId.localeCompare(b.sourceAgentId);
    if (sourceCompare !== 0) return sourceCompare;
    const targetCompare = a.targetAgentId.localeCompare(b.targetAgentId);
    if (targetCompare !== 0) return targetCompare;
    return Number(a.weight) - Number(b.weight);
  });

  for (const inter of sortedInteractions) {
    allAgentIds.add(inter.sourceAgentId);
    allAgentIds.add(inter.targetAgentId);

    for (const [a, b] of [
      [inter.sourceAgentId, inter.targetAgentId],
      [inter.targetAgentId, inter.sourceAgentId],
    ]) {
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      const current = adjacency.get(a)!.get(b) || 0;
      adjacency.get(a)!.set(b, current + Number(inter.weight));
    }
  }

  if (allAgentIds.size === 0) {
    return { communitiesFound: 0, agentsLabeled: 0 };
  }

  const agentArray = Array.from(allAgentIds).sort();
  const labels = new Map<string, number>();
  agentArray.forEach((id, i) => labels.set(id, i));

  const MAX_ITERATIONS = 20;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    for (const agentId of agentArray) {
      const neighbors = adjacency.get(agentId);
      if (!neighbors || neighbors.size === 0) continue;

      const labelVotes = new Map<number, number>();
      for (const [neighborId, weight] of neighbors) {
        const neighborLabel = labels.get(neighborId)!;
        labelVotes.set(neighborLabel, (labelVotes.get(neighborLabel) || 0) + weight);
      }

      let bestLabel = labels.get(agentId)!;
      let bestVotes = Number.NEGATIVE_INFINITY;
      for (const [label, votes] of labelVotes) {
        if (votes > bestVotes || (votes === bestVotes && label < bestLabel)) {
          bestVotes = votes;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(agentId)) {
        labels.set(agentId, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const uniqueLabels = [...new Set(labels.values())].sort((a, b) => a - b);
  const labelMap = new Map<number, number>();
  uniqueLabels.forEach((label, i) => labelMap.set(label, i));

  const updateRows = Array.from(labels.entries()).map(([agentId, label]) => ({
    agentId,
    communityLabel: labelMap.get(label)!,
  }));

  for (const rowChunk of chunk(updateRows, 500)) {
    const values = sql.join(
      rowChunk.map((row) => sql`(${row.agentId}::uuid, ${row.communityLabel}::int)`),
      sql`,`
    );

    await db.execute(sql`
      UPDATE agents AS a
      SET community_label = v.community_label
      FROM (
        VALUES ${values}
      ) AS v(id, community_label)
      WHERE a.id = v.id
    `);
  }

  return {
    communitiesFound: uniqueLabels.length,
    agentsLabeled: updateRows.length,
  };
}
