import { db } from "../db";
import {
  agents,
  agentIdentities,
  actions,
  interactions,
  agentProfiles,
  dailyAgentStats,
} from "../db/schema";
import { gte, sql, inArray } from "drizzle-orm";
import { subHours, subDays } from "date-fns";
import {
  getBootstrapStart,
  getStageCursor,
  GLOBAL_CURSOR_SCOPE,
  setStageCursor,
} from "./cursors";

export interface MarketplaceCategorySpread {
  category: string;
  count: number;
  share: number;
}

export interface MarketplaceMetrics {
  bountiesPosted: number;
  totalApplicationsReceived: number;
  uniqueContributors: number;
  assignmentRate: number;
  medianBountyPrice: number | null;
  categorySpread: MarketplaceCategorySpread[];
  recentPostingCadence: number;
}

import { extractRows, toNumber, chunk } from "./utils";

export async function computeMarketplaceAgentMetrics(
  agentId: string
): Promise<MarketplaceMetrics> {
  const [summaryResult, assignmentResult, medianPriceResult, categoryResult] =
    await Promise.all([
      db.execute<{
        bounties_posted: number;
        total_applications_received: number;
        posts_30d: number;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE action_type = 'post')::int AS bounties_posted,
          COALESCE(SUM(reply_count) FILTER (WHERE action_type = 'post'), 0)::int AS total_applications_received,
          COUNT(*) FILTER (WHERE action_type = 'post' AND performed_at >= NOW() - INTERVAL '30 days')::int AS posts_30d
        FROM actions
        WHERE platform_id = 'rentahuman' AND agent_id = ${agentId}
      `),
      db.execute<{
        unique_contributors: number;
        bounties_with_assignments: number;
      }>(sql`
        SELECT
          COUNT(DISTINCT c.agent_id)::int AS unique_contributors,
          COUNT(DISTINCT p.id) FILTER (WHERE c.id IS NOT NULL)::int AS bounties_with_assignments
        FROM actions p
        LEFT JOIN actions c
          ON c.parent_action_id = p.id
         AND c.platform_id = 'rentahuman'
         AND COALESCE(c.raw_data->>'kind', '') = 'assignment'
        WHERE p.platform_id = 'rentahuman'
          AND p.action_type = 'post'
          AND p.agent_id = ${agentId}
      `),
      db.execute<{ median_price: string | number | null }>(sql`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (raw_data->>'price')::numeric) AS median_price
        FROM actions
        WHERE platform_id = 'rentahuman'
          AND action_type = 'post'
          AND agent_id = ${agentId}
          AND raw_data->>'price' IS NOT NULL
          AND (raw_data->>'price') ~ '^[0-9]+(\\.[0-9]+)?$'
      `),
      db.execute<{ category: string | null; count: number }>(sql`
        SELECT
          COALESCE(raw_data->>'category', 'Uncategorized') AS category,
          COUNT(*)::int AS count
        FROM actions
        WHERE platform_id = 'rentahuman'
          AND action_type = 'post'
          AND agent_id = ${agentId}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 8
      `),
    ]);

  const summary = extractRows<{
    bounties_posted: number;
    total_applications_received: number;
    posts_30d: number;
  }>(summaryResult)[0];
  const assignments = extractRows<{
    unique_contributors: number;
    bounties_with_assignments: number;
  }>(assignmentResult)[0];
  const medianPrice = extractRows<{ median_price: string | number | null }>(
    medianPriceResult
  )[0];
  const categoryRows = extractRows<{ category: string | null; count: number }>(
    categoryResult
  );

  const bountiesPosted = Number(summary?.bounties_posted) || 0;
  const totalApplicationsReceived =
    Number(summary?.total_applications_received) || 0;
  const uniqueContributors = Number(assignments?.unique_contributors) || 0;
  const bountiesWithAssignments =
    Number(assignments?.bounties_with_assignments) || 0;
  const assignmentRate =
    bountiesPosted > 0 ? bountiesWithAssignments / bountiesPosted : 0;
  const medianBountyPrice =
    medianPrice?.median_price == null
      ? null
      : Number(medianPrice.median_price);
  const posts30d = Number(summary?.posts_30d) || 0;
  const recentPostingCadence = Number(((posts30d * 7) / 30).toFixed(2));

  return {
    bountiesPosted,
    totalApplicationsReceived,
    uniqueContributors,
    assignmentRate,
    medianBountyPrice,
    categorySpread: categoryRows.map((row) => ({
      category: row.category || "Uncategorized",
      count: Number(row.count) || 0,
      share:
        bountiesPosted > 0
          ? Number((Number(row.count || 0) / bountiesPosted).toFixed(4))
          : 0,
    })),
    recentPostingCadence,
  };
}

interface AgentUpdateRow {
  agentId: string;
  influenceScore: number;
  autonomyScore: number;
  activityScore: number;
  agentType: string;
  postingRegularity: number | null;
  peakHourUtc: number | null;
  burstCount7d: number;
  postCount: number;
  commentCount: number;
}

async function bulkUpdateAgents(rows: AgentUpdateRow[]): Promise<void> {
  for (const group of chunk(rows, 500)) {
    const values = sql.join(
      group.map((row) => sql`
        (
          ${row.agentId}::uuid,
          ${row.influenceScore}::real,
          ${row.autonomyScore}::real,
          ${row.activityScore}::real,
          ${row.agentType}::text,
          ${row.postingRegularity}::real,
          ${row.peakHourUtc}::int,
          ${row.burstCount7d}::int
        )
      `),
      sql`,`
    );

    await db.execute(sql`
      UPDATE agents AS a
      SET
        influence_score = v.influence_score,
        autonomy_score = v.autonomy_score,
        activity_score = v.activity_score,
        agent_type = v.agent_type,
        posting_regularity = v.posting_regularity,
        peak_hour_utc = v.peak_hour_utc,
        burst_count_7d = v.burst_count_7d
      FROM (
        VALUES ${values}
      ) AS v(
        id,
        influence_score,
        autonomy_score,
        activity_score,
        agent_type,
        posting_regularity,
        peak_hour_utc,
        burst_count_7d
      )
      WHERE a.id = v.id
    `);
  }
}

async function bulkUpdateTopics(
  rows: Array<{
    topicId: string;
    velocity: number;
    agentCount: number;
    avgSentiment: number | null;
  }>
): Promise<void> {
  for (const group of chunk(rows, 500)) {
    const values = sql.join(
      group.map((row) => sql`
        (
          ${row.topicId}::uuid,
          ${row.velocity}::real,
          ${row.agentCount}::int,
          ${row.avgSentiment}::real
        )
      `),
      sql`,`
    );

    await db.execute(sql`
      UPDATE topics AS t
      SET
        velocity = v.velocity,
        agent_count = v.agent_count,
        avg_sentiment = v.avg_sentiment
      FROM (
        VALUES ${values}
      ) AS v(id, velocity, agent_count, avg_sentiment)
      WHERE t.id = v.id
    `);
  }
}

/**
 * Compute behavioral analysis with incremental cursors.
 */
export async function runAnalysis(): Promise<{
  agentsUpdated: number;
  topicsUpdated: number;
}> {
  const now = new Date();
  const last24h = subHours(now, 24);
  const last7d = subHours(now, 168);
  const last14d = subDays(now, 14);
  const last7dDate = subDays(now, 7);

  const cursor = await getStageCursor("analyze", GLOBAL_CURSOR_SCOPE);
  const cursorStart = cursor?.cursorTs ?? getBootstrapStart("analyze", now);

  const [changedAgentsResult, changedTopicsResult] = await Promise.all([
    db.execute<{ agent_id: string }>(sql`
      SELECT DISTINCT agent_id
      FROM (
        SELECT a.agent_id
        FROM actions a
        WHERE a.agent_id IS NOT NULL
          AND a.ingested_at >= ${cursorStart}

        UNION ALL

        SELECT a.agent_id
        FROM enrichments e
        INNER JOIN actions a ON a.id = e.action_id
        WHERE a.agent_id IS NOT NULL
          AND e.processed_at >= ${cursorStart}

        UNION ALL

        SELECT i.source_agent_id AS agent_id
        FROM interactions i
        WHERE i.created_at >= ${cursorStart}

        UNION ALL

        SELECT i.target_agent_id AS agent_id
        FROM interactions i
        WHERE i.created_at >= ${cursorStart}
      ) AS changed
      WHERE agent_id IS NOT NULL
    `),
    db.execute<{ topic_id: string }>(sql`
      SELECT DISTINCT topic_id
      FROM (
        SELECT at.topic_id
        FROM action_topics at
        INNER JOIN actions a ON a.id = at.action_id
        WHERE a.ingested_at >= ${cursorStart}

        UNION ALL

        SELECT at.topic_id
        FROM action_topics at
        INNER JOIN actions a ON a.id = at.action_id
        INNER JOIN enrichments e ON e.action_id = a.id
        WHERE e.processed_at >= ${cursorStart}
      ) AS changed
      WHERE topic_id IS NOT NULL
    `),
  ]);

  const changedAgentIds = extractRows<{ agent_id: string }>(changedAgentsResult)
    .map((row) => row.agent_id)
    .filter(Boolean);
  const changedTopicIds = extractRows<{ topic_id: string }>(changedTopicsResult)
    .map((row) => row.topic_id)
    .filter(Boolean);

  if (changedAgentIds.length === 0 && changedTopicIds.length === 0) {
    await setStageCursor("analyze", GLOBAL_CURSOR_SCOPE, now, {
      cursorStart: cursorStart.toISOString(),
      reason: "no_changes",
    });
    return { agentsUpdated: 0, topicsUpdated: 0 };
  }

  // Graph inputs are fetched once per run.
  const [activeAgents, recentInteractions, substantiveResult] = await Promise.all([
    db
      .select({ agentId: actions.agentId })
      .from(actions)
      .where(gte(actions.performedAt, last7d))
      .groupBy(actions.agentId),
    db
      .select({
        sourceAgentId: interactions.sourceAgentId,
        targetAgentId: interactions.targetAgentId,
        weight: interactions.weight,
        actionId: interactions.actionId,
      })
      .from(interactions)
      .where(gte(interactions.createdAt, last7d)),
    db.execute<{ action_id: string }>(sql`
      SELECT action_id
      FROM enrichments
      WHERE is_substantive = true
    `),
  ]);

  const substantiveActionIds = new Set(
    extractRows<{ action_id: string }>(substantiveResult).map((row) => row.action_id)
  );

  const allAgentIds = new Set<string>();
  const incomingEdges = new Map<string, Array<{ from: string; weight: number }>>();
  const outgoingWeight = new Map<string, number>();

  for (const row of activeAgents) {
    if (row.agentId) allAgentIds.add(row.agentId);
  }

  for (const inter of recentInteractions) {
    allAgentIds.add(inter.sourceAgentId);
    allAgentIds.add(inter.targetAgentId);

    const qualityMultiplier = inter.actionId && substantiveActionIds.has(inter.actionId) ? 1.5 : 0.5;
    const edgeWeight = toNumber(inter.weight) * qualityMultiplier;

    if (!incomingEdges.has(inter.targetAgentId)) {
      incomingEdges.set(inter.targetAgentId, []);
    }
    incomingEdges.get(inter.targetAgentId)!.push({
      from: inter.sourceAgentId,
      weight: edgeWeight,
    });

    outgoingWeight.set(
      inter.sourceAgentId,
      (outgoingWeight.get(inter.sourceAgentId) || 0) + edgeWeight
    );
  }

  const DAMPING = 0.85;
  const ITERATIONS = 10;
  const agentIdsList = Array.from(allAgentIds);
  const n = agentIdsList.length;

  const scores = new Map<string, number>();
  for (const id of agentIdsList) {
    scores.set(id, 1 / Math.max(n, 1));
  }

  if (n > 0) {
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const next = new Map<string, number>();
      for (const id of agentIdsList) {
        let incomingSum = 0;
        const edges = incomingEdges.get(id) || [];
        for (const edge of edges) {
          const senderScore = scores.get(edge.from) || 0;
          const senderOut = outgoingWeight.get(edge.from) || 1;
          incomingSum += (senderScore * edge.weight) / senderOut;
        }
        next.set(id, (1 - DAMPING) / n + DAMPING * incomingSum);
      }
      for (const [id, score] of next) {
        scores.set(id, score);
      }
    }
  }

  const maxPageRank = Math.max(...scores.values(), 0.001);
  const normalizedScores = new Map<string, number>();
  for (const [id, score] of scores) {
    normalizedScores.set(id, score / maxPageRank);
  }

  const agentsForUpdate = changedAgentIds.filter((id, index, list) => list.indexOf(id) === index);
  const topicsForUpdate = changedTopicIds.filter((id, index, list) => list.indexOf(id) === index);

  const [humanIdentityRows, autonomyResult, breakdownResult, recentCountsResult, firstSeenRows, dailyStatsRows] =
    await Promise.all([
      agentsForUpdate.length > 0
        ? db
            .select({ agentId: agentIdentities.agentId, rawProfile: agentIdentities.rawProfile })
            .from(agentIdentities)
            .where(inArray(agentIdentities.agentId, agentsForUpdate))
        : Promise.resolve([]),
      agentsForUpdate.length > 0
        ? db.execute<{ agent_id: string; avg_autonomy: number | null }>(sql`
            SELECT a.agent_id, AVG(e.autonomy_score)::real AS avg_autonomy
            FROM actions a
            LEFT JOIN enrichments e ON e.action_id = a.id
            WHERE a.agent_id = ANY(${agentsForUpdate}::uuid[])
            GROUP BY a.agent_id
          `)
        : Promise.resolve([]),
      agentsForUpdate.length > 0
        ? db.execute<{ agent_id: string; action_type: string; count: number }>(sql`
            SELECT a.agent_id, a.action_type::text, COUNT(*)::int AS count
            FROM actions a
            WHERE a.agent_id = ANY(${agentsForUpdate}::uuid[])
            GROUP BY a.agent_id, a.action_type
          `)
        : Promise.resolve([]),
      agentsForUpdate.length > 0
        ? db.execute<{
            agent_id: string;
            substantive_count: number;
            non_substantive_count: number;
            unenriched_count: number;
          }>(sql`
            SELECT
              a.agent_id,
              COUNT(*) FILTER (WHERE e.is_substantive = true)::int AS substantive_count,
              COUNT(*) FILTER (
                WHERE a.is_enriched = true AND (e.is_substantive = false OR e.is_substantive IS NULL)
              )::int AS non_substantive_count,
              COUNT(*) FILTER (WHERE a.is_enriched = false)::int AS unenriched_count
            FROM actions a
            LEFT JOIN enrichments e ON e.action_id = a.id
            WHERE a.agent_id = ANY(${agentsForUpdate}::uuid[])
              AND a.performed_at >= ${last24h}
            GROUP BY a.agent_id
          `)
        : Promise.resolve([]),
      agentsForUpdate.length > 0
        ? db
            .select({ id: agents.id, firstSeenAt: agents.firstSeenAt })
            .from(agents)
            .where(inArray(agents.id, agentsForUpdate))
        : Promise.resolve([]),
      agentsForUpdate.length > 0
        ? db
            .select({
              agentId: dailyAgentStats.agentId,
              date: dailyAgentStats.date,
              postCount: dailyAgentStats.postCount,
              commentCount: dailyAgentStats.commentCount,
              activeHours: dailyAgentStats.activeHours,
            })
            .from(dailyAgentStats)
            .where(
              sql`${dailyAgentStats.agentId} = ANY(${agentsForUpdate}::uuid[]) AND ${dailyAgentStats.date} >= ${last14d}`
            )
        : Promise.resolve([]),
    ]);

  const humanAgentIds = new Set<string>();
  for (const row of humanIdentityRows) {
    if ((row.rawProfile as Record<string, unknown>)?.actorKind === "human") {
      humanAgentIds.add(row.agentId);
    }
  }

  const autonomyByAgent = new Map<string, number>();
  for (const row of extractRows<{ agent_id: string; avg_autonomy: number | null }>(autonomyResult)) {
    autonomyByAgent.set(row.agent_id, toNumber(row.avg_autonomy, 0));
  }

  const breakdownByAgent = new Map<string, { postCount: number; commentCount: number }>();
  for (const row of extractRows<{ agent_id: string; action_type: string; count: number }>(breakdownResult)) {
    const current = breakdownByAgent.get(row.agent_id) || { postCount: 0, commentCount: 0 };
    const count = toNumber(row.count, 0);
    if (row.action_type === "post") {
      current.postCount += count;
    } else if (row.action_type === "comment" || row.action_type === "reply") {
      current.commentCount += count;
    }
    breakdownByAgent.set(row.agent_id, current);
  }

  const recentCountsByAgent = new Map<
    string,
    { substantiveCount: number; nonSubstantiveCount: number; unenrichedCount: number }
  >();
  for (const row of extractRows<{
    agent_id: string;
    substantive_count: number;
    non_substantive_count: number;
    unenriched_count: number;
  }>(recentCountsResult)) {
    recentCountsByAgent.set(row.agent_id, {
      substantiveCount: toNumber(row.substantive_count),
      nonSubstantiveCount: toNumber(row.non_substantive_count),
      unenrichedCount: toNumber(row.unenriched_count),
    });
  }

  const firstSeenByAgent = new Map<string, Date>();
  for (const row of firstSeenRows) {
    firstSeenByAgent.set(row.id, row.firstSeenAt);
  }

  const dailyStatsByAgent = new Map<
    string,
    Array<{ date: Date; postCount: number | null; commentCount: number | null; activeHours: unknown }>
  >();
  for (const row of dailyStatsRows) {
    const existing = dailyStatsByAgent.get(row.agentId) || [];
    existing.push(row);
    dailyStatsByAgent.set(row.agentId, existing);
  }

  const updates: AgentUpdateRow[] = [];
  for (const agentId of agentsForUpdate) {
    if (humanAgentIds.has(agentId)) continue;

    const influenceScore = normalizedScores.get(agentId) || 0;
    const autonomyScore = autonomyByAgent.get(agentId) || 0;

    const breakdown = breakdownByAgent.get(agentId) || { postCount: 0, commentCount: 0 };
    const postCount = breakdown.postCount;
    const commentCount = breakdown.commentCount;

    const recent = recentCountsByAgent.get(agentId) || {
      substantiveCount: 0,
      nonSubstantiveCount: 0,
      unenrichedCount: 0,
    };
    const qualityWeighted =
      recent.substantiveCount * 1.0 + recent.nonSubstantiveCount * 0.3 + recent.unenrichedCount * 0.5;
    const activityScore = Math.min(qualityWeighted / 15, 1.0);

    const total = postCount + commentCount;
    let agentType = "lurker";
    if (autonomyScore < 0.2 && total > 30) agentType = "bot_farm";
    else if (total > 50 && postCount > commentCount * 2) agentType = "content_creator";
    else if (total > 50 && commentCount > postCount * 3) agentType = "commenter";
    else if (total > 50) agentType = "conversationalist";
    else if (total > 20) agentType = "active";
    else if (total >= 10 && total <= 20) {
      const firstSeenAt = firstSeenByAgent.get(agentId);
      if (firstSeenAt && now.getTime() - firstSeenAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
        agentType = "rising";
      }
    }

    const dailyStats = (dailyStatsByAgent.get(agentId) || []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let postingRegularity: number | null = null;
    let peakHourUtc: number | null = null;
    let burstCount7d = 0;

    if (dailyStats.length >= 3) {
      const dailyCounts = dailyStats.map((d) => toNumber(d.postCount) + toNumber(d.commentCount));
      const mean = dailyCounts.reduce((sum, v) => sum + v, 0) / dailyCounts.length;
      const variance =
        dailyCounts.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dailyCounts.length;
      postingRegularity = Math.sqrt(variance);

      const hourCounts = new Map<number, number>();
      for (const stat of dailyStats) {
        if (!Array.isArray(stat.activeHours)) continue;
        for (const hour of stat.activeHours as unknown[]) {
          const normalizedHour = toNumber(hour, -1);
          if (normalizedHour < 0 || normalizedHour > 23) continue;
          hourCounts.set(normalizedHour, (hourCounts.get(normalizedHour) || 0) + 1);
        }
      }

      let maxHourCount = 0;
      for (const [hour, c] of hourCounts) {
        if (c > maxHourCount) {
          maxHourCount = c;
          peakHourUtc = hour;
        }
      }

      const last7dStats = dailyStats.filter(
        (d) => new Date(d.date).getTime() >= last7dDate.getTime()
      );
      burstCount7d = last7dStats.filter((d) => {
        const dayTotal = toNumber(d.postCount) + toNumber(d.commentCount);
        return mean > 0 && dayTotal > mean * 3;
      }).length;
    }

    updates.push({
      agentId,
      influenceScore,
      autonomyScore,
      activityScore,
      agentType,
      postingRegularity,
      peakHourUtc,
      burstCount7d,
      postCount,
      commentCount,
    });
  }

  if (updates.length > 0) {
    await bulkUpdateAgents(updates);

    for (const profileChunk of chunk(updates, 500)) {
      await db.insert(agentProfiles).values(
        profileChunk.map((row) => ({
          agentId: row.agentId,
          influenceScore: row.influenceScore,
          autonomyScore: row.autonomyScore,
          activityScore: row.activityScore,
          agentType: row.agentType,
          postCount: row.postCount,
          commentCount: row.commentCount,
        }))
      );
    }
  }

  const topicRows =
    topicsForUpdate.length > 0
      ? await db.execute<{
          topic_id: string;
          recent_count: number;
          agent_count: number;
          avg_sentiment: number | null;
        }>(sql`
          SELECT
            at.topic_id,
            COUNT(*) FILTER (WHERE a.performed_at >= ${last24h})::int AS recent_count,
            COUNT(DISTINCT a.agent_id)::int AS agent_count,
            AVG(e.sentiment)::real AS avg_sentiment
          FROM action_topics at
          INNER JOIN actions a ON a.id = at.action_id
          LEFT JOIN enrichments e ON e.action_id = a.id
          WHERE at.topic_id = ANY(${topicsForUpdate}::uuid[])
          GROUP BY at.topic_id
        `)
      : [];

  const topicStatsById = new Map<string, { recentCount: number; agentCount: number; avgSentiment: number | null }>();
  for (const row of extractRows<{
    topic_id: string;
    recent_count: number;
    agent_count: number;
    avg_sentiment: number | null;
  }>(topicRows)) {
    topicStatsById.set(row.topic_id, {
      recentCount: toNumber(row.recent_count),
      agentCount: toNumber(row.agent_count),
      avgSentiment: row.avg_sentiment == null ? null : toNumber(row.avg_sentiment, 0),
    });
  }

  const topicUpdates = topicsForUpdate.map((topicId) => {
    const stats = topicStatsById.get(topicId) || {
      recentCount: 0,
      agentCount: 0,
      avgSentiment: null,
    };
    return {
      topicId,
      velocity: stats.recentCount / 24,
      agentCount: stats.agentCount,
      avgSentiment: stats.avgSentiment,
    };
  });

  if (topicUpdates.length > 0) {
    await bulkUpdateTopics(topicUpdates);
  }

  await setStageCursor("analyze", GLOBAL_CURSOR_SCOPE, now, {
    cursorStart: cursorStart.toISOString(),
    changedAgents: agentsForUpdate.length,
    changedTopics: topicsForUpdate.length,
    agentsUpdated: updates.length,
    topicsUpdated: topicUpdates.length,
  });

  return {
    agentsUpdated: updates.length,
    topicsUpdated: topicUpdates.length,
  };
}
