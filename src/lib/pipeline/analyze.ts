import { db } from "../db";
import {
  agents,
  agentIdentities,
  actions,
  enrichments,
  interactions,
  agentProfiles,
  topics,
  actionTopics,
  dailyAgentStats,
} from "../db/schema";
import { eq, desc, gte, lte, sql, count, avg, and, inArray } from "drizzle-orm";
import { subHours, subDays } from "date-fns";

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

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>)) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

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

/**
 * Compute behavioral analysis. Call every 4 hours.
 */
export async function runAnalysis(): Promise<{
  agentsUpdated: number;
  topicsUpdated: number;
}> {
  const now = new Date();
  const last24h = subHours(now, 24);
  const last7d = subHours(now, 168);

  // 1. Compute influence scores (PageRank-style)
  // Include all agents active in last 7 days, even if they received no interactions.
  const activeAgents = await db
    .select({ agentId: actions.agentId })
    .from(actions)
    .where(gte(actions.performedAt, last7d))
    .groupBy(actions.agentId);

  // Fetch all recent interactions for PageRank graph
  const recentInteractions = await db
    .select({
      sourceAgentId: interactions.sourceAgentId,
      targetAgentId: interactions.targetAgentId,
      weight: interactions.weight,
      actionId: interactions.actionId,
    })
    .from(interactions)
    .where(gte(interactions.createdAt, last7d));

  const analyzableAgentIds = new Set<string>();
  for (const row of activeAgents) {
    if (row.agentId) analyzableAgentIds.add(row.agentId);
  }
  for (const inter of recentInteractions) {
    analyzableAgentIds.add(inter.sourceAgentId);
    analyzableAgentIds.add(inter.targetAgentId);
  }

  // Fetch substantive action IDs to weight quality
  const substantiveActionIds = new Set(
    (await db
      .select({ actionId: enrichments.actionId })
      .from(enrichments)
      .where(eq(enrichments.isSubstantive, true))
    ).map((r) => r.actionId)
  );

  // Build the interaction graph
  const allAgentIds = new Set<string>();
  const incomingEdges = new Map<string, Array<{ from: string; weight: number }>>();

  for (const inter of recentInteractions) {
    allAgentIds.add(inter.sourceAgentId);
    allAgentIds.add(inter.targetAgentId);

    if (!incomingEdges.has(inter.targetAgentId)) {
      incomingEdges.set(inter.targetAgentId, []);
    }

    const qualityMultiplier = inter.actionId && substantiveActionIds.has(inter.actionId) ? 1.5 : 0.5;
    const edgeWeight = Number(inter.weight) * qualityMultiplier;

    incomingEdges.get(inter.targetAgentId)!.push({
      from: inter.sourceAgentId,
      weight: edgeWeight,
    });
  }

  // Simplified PageRank (10 iterations, damping 0.85)
  const DAMPING = 0.85;
  const ITERATIONS = 10;
  const agentIdsList = Array.from(allAgentIds);
  const n = agentIdsList.length;

  const scores = new Map<string, number>();
  for (const id of agentIdsList) {
    scores.set(id, 1 / Math.max(n, 1));
  }

  // Compute total outgoing weight per agent
  const outgoingWeight = new Map<string, number>();
  for (const inter of recentInteractions) {
    const qualityMultiplier = inter.actionId && substantiveActionIds.has(inter.actionId) ? 1.5 : 0.5;
    const w = Number(inter.weight) * qualityMultiplier;
    outgoingWeight.set(
      inter.sourceAgentId,
      (outgoingWeight.get(inter.sourceAgentId) || 0) + w
    );
  }

  if (n > 0) {
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const newScores = new Map<string, number>();

      for (const id of agentIdsList) {
        let incomingSum = 0;
        const edges = incomingEdges.get(id) || [];

        for (const edge of edges) {
          const senderScore = scores.get(edge.from) || 0;
          const senderTotalOut = outgoingWeight.get(edge.from) || 1;
          incomingSum += (senderScore * edge.weight) / senderTotalOut;
        }

        newScores.set(id, (1 - DAMPING) / n + DAMPING * incomingSum);
      }

      for (const [id, score] of newScores) {
        scores.set(id, score);
      }
    }
  }

  // Normalize PageRank scores to 0-1 range
  const maxPageRank = Math.max(...scores.values(), 0.001);
  const normalizedScores = new Map<string, number>();
  for (const [id, score] of scores) {
    normalizedScores.set(id, score / maxPageRank);
  }

  // Skip human service providers — scores are meaningless for non-autonomous actors
  const humanAgentIds = new Set<string>();
  if (analyzableAgentIds.size > 0) {
    const identitiesWithKind = await db
      .select({ agentId: agentIdentities.agentId, rawProfile: agentIdentities.rawProfile })
      .from(agentIdentities)
      .where(inArray(agentIdentities.agentId, [...analyzableAgentIds]));
    for (const row of identitiesWithKind) {
      if ((row.rawProfile as Record<string, unknown>)?.actorKind === "human") {
        humanAgentIds.add(row.agentId);
      }
    }
  }

  let agentsUpdated = 0;

  for (const agentId of analyzableAgentIds) {
    if (humanAgentIds.has(agentId)) continue;
    const influenceScore = normalizedScores.get(agentId) || 0;

    // Get average autonomy score for this agent's actions
    const agentEnrichments = await db
      .select({
        avgAutonomy: avg(enrichments.autonomyScore).as("avg_autonomy"),
      })
      .from(enrichments)
      .innerJoin(actions, eq(enrichments.actionId, actions.id))
      .where(eq(actions.agentId, agentId));

    const autonomyScore = Number(agentEnrichments[0]?.avgAutonomy) || 0;

    // Get activity breakdown
    const activityBreakdown = await db
      .select({
        actionType: actions.actionType,
        count: count(actions.id).as("count"),
      })
      .from(actions)
      .where(eq(actions.agentId, agentId))
      .groupBy(actions.actionType);

    const postCount =
      activityBreakdown.find((a) => a.actionType === "post")?.count || 0;
    const commentCount = activityBreakdown
      .filter((a) => a.actionType === "comment" || a.actionType === "reply")
      .reduce((sum, a) => sum + Number(a.count), 0);

    // Compute quality-weighted activity score (Phase 2.2)
    // Substantive actions count 1.0, non-substantive count 0.3
    const recentSubstantive = await db
      .select({ count: count(actions.id) })
      .from(actions)
      .innerJoin(enrichments, eq(enrichments.actionId, actions.id))
      .where(
        sql`${actions.agentId} = ${agentId} AND ${actions.performedAt} >= ${last24h} AND ${enrichments.isSubstantive} = true`
      );

    const recentNonSubstantive = await db
      .select({ count: count(actions.id) })
      .from(actions)
      .innerJoin(enrichments, eq(enrichments.actionId, actions.id))
      .where(
        sql`${actions.agentId} = ${agentId} AND ${actions.performedAt} >= ${last24h} AND (${enrichments.isSubstantive} = false OR ${enrichments.isSubstantive} IS NULL)`
      );

    // Also count unenriched recent actions (treat as 0.5 weight)
    const recentUnenriched = await db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(
        sql`${actions.agentId} = ${agentId} AND ${actions.performedAt} >= ${last24h} AND ${actions.isEnriched} = false`
      );

    const substantiveCount = Number(recentSubstantive[0]?.count) || 0;
    const nonSubstantiveCount = Number(recentNonSubstantive[0]?.count) || 0;
    const unenrichedCount = Number(recentUnenriched[0]?.count) || 0;
    const qualityWeighted =
      substantiveCount * 1.0 + nonSubstantiveCount * 0.3 + unenrichedCount * 0.5;
    const activityScore = Math.min(qualityWeighted / 15, 1.0);

    // Classify agent type
    const total = Number(postCount) + Number(commentCount);
    let agentType = "lurker";

    // Check bot_farm FIRST — low autonomy + high volume is suspicious regardless of other patterns
    if (autonomyScore < 0.2 && total > 30)
      agentType = "bot_farm";
    else if (total > 50 && Number(postCount) > Number(commentCount) * 2)
      agentType = "content_creator";
    else if (total > 50 && Number(commentCount) > Number(postCount) * 3)
      agentType = "commenter";
    else if (total > 50)
      agentType = "conversationalist"; // balanced post/comment ratio
    else if (total > 20)
      agentType = "active";
    else if (total >= 10 && total <= 20) {
      // Check if agent is "rising" (first seen within 7 days)
      const agentRecord = await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      });
      if (agentRecord && (now.getTime() - new Date(agentRecord.firstSeenAt).getTime()) < 7 * 24 * 60 * 60 * 1000) {
        agentType = "rising";
      }
    }

    // Update agent
    await db
      .update(agents)
      .set({
        influenceScore,
        autonomyScore,
        activityScore,
        agentType,
      })
      .where(eq(agents.id, agentId));

    // Save profile snapshot
    await db.insert(agentProfiles).values({
      agentId,
      influenceScore,
      autonomyScore,
      activityScore,
      agentType,
      postCount: Number(postCount),
      commentCount: Number(commentCount),
    });

    agentsUpdated++;
  }

  // 2. Temporal pattern detection (Phase 2.4)
  // Uses dailyAgentStats to compute posting regularity, peak hours, and burst detection
  const last14d = subDays(now, 14);
  const last7dDate = subDays(now, 7);

  const agentsWithDailyStats = await db
    .select({ agentId: dailyAgentStats.agentId })
    .from(dailyAgentStats)
    .where(gte(dailyAgentStats.date, last14d))
    .groupBy(dailyAgentStats.agentId);

  for (const { agentId } of agentsWithDailyStats) {
    // Get 14-day daily stats
    const dailyStats = await db
      .select({
        date: dailyAgentStats.date,
        postCount: dailyAgentStats.postCount,
        commentCount: dailyAgentStats.commentCount,
        activeHours: dailyAgentStats.activeHours,
      })
      .from(dailyAgentStats)
      .where(
        and(
          eq(dailyAgentStats.agentId, agentId),
          gte(dailyAgentStats.date, last14d)
        )
      )
      .orderBy(dailyAgentStats.date);

    if (dailyStats.length < 3) continue; // Need at least 3 days of data

    // Posting regularity: stddev of daily action counts
    const dailyCounts = dailyStats.map(
      (d) => (d.postCount ?? 0) + (d.commentCount ?? 0)
    );
    const mean = dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length;
    const variance =
      dailyCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) /
      dailyCounts.length;
    const postingRegularity = Math.sqrt(variance);

    // Peak hours: flatten all active hours, find most common
    const hourCounts = new Map<number, number>();
    for (const d of dailyStats) {
      if (d.activeHours && Array.isArray(d.activeHours)) {
        for (const hour of d.activeHours) {
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        }
      }
    }
    let peakHourUtc: number | null = null;
    let maxHourCount = 0;
    for (const [hour, c] of hourCounts) {
      if (c > maxHourCount) {
        maxHourCount = c;
        peakHourUtc = hour;
      }
    }

    // Burst detection: days in last 7d exceeding 3x the 14-day average
    const avg14d = mean;
    const last7dStats = dailyStats.filter(
      (d) => new Date(d.date).getTime() >= last7dDate.getTime()
    );
    const burstCount7d = last7dStats.filter((d) => {
      const dayTotal = (d.postCount ?? 0) + (d.commentCount ?? 0);
      return avg14d > 0 && dayTotal > avg14d * 3;
    }).length;

    await db
      .update(agents)
      .set({
        postingRegularity,
        peakHourUtc,
        burstCount7d,
      })
      .where(eq(agents.id, agentId));
  }

  // 3. Update topic stats
  let topicsUpdated = 0;
  const allTopics = await db.query.topics.findMany();

  for (const topic of allTopics) {
    // Count actions in last 24h for velocity
    const recentActionCount = await db
      .select({ count: count(actionTopics.id) })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .where(
        sql`${actionTopics.topicId} = ${topic.id} AND ${actions.performedAt} >= ${last24h}`
      );

    // Count distinct agents
    const distinctAgents = await db
      .select({
        count:
          sql<number>`COUNT(DISTINCT ${actions.agentId})`.as("count"),
      })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .where(eq(actionTopics.topicId, topic.id));

    // Avg sentiment
    const avgSentiment = await db
      .select({ avg: avg(enrichments.sentiment) })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .innerJoin(enrichments, eq(enrichments.actionId, actions.id))
      .where(eq(actionTopics.topicId, topic.id));

    const actionCountVal = Number(recentActionCount[0]?.count) || 0;
    const velocity = actionCountVal / 24; // actions per hour

    await db
      .update(topics)
      .set({
        velocity,
        agentCount: Number(distinctAgents[0]?.count) || 0,
        avgSentiment: Number(avgSentiment[0]?.avg) || null,
      })
      .where(eq(topics.id, topic.id));

    topicsUpdated++;
  }

  return { agentsUpdated, topicsUpdated };
}
