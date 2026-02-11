import { db } from "../db";
import {
  actions,
  enrichments,
  interactions,
  actionTopics,
  dailyAgentStats,
  dailyTopicStats,
  topicCooccurrences,
} from "../db/schema";
import { eq, and, gte, lt, sql, count, avg } from "drizzle-orm";
import { startOfDay } from "date-fns";

/**
 * Aggregate daily stats for agents and topics.
 * Call at end of each analyze cycle or via dedicated cron.
 */
export async function runAggregation(targetDate?: Date): Promise<{
  agentsAggregated: number;
  topicsAggregated: number;
}> {
  const date = startOfDay(targetDate || new Date());
  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  let agentsAggregated = 0;
  let topicsAggregated = 0;

  // 1. Get all agents who had actions on this day
  const activeAgents = await db
    .select({
      agentId: actions.agentId,
    })
    .from(actions)
    .where(and(gte(actions.performedAt, date), lt(actions.performedAt, nextDay)))
    .groupBy(actions.agentId);

  for (const { agentId } of activeAgents) {
    if (!agentId) continue;

    // Count posts vs comments
    const activityBreakdown = await db
      .select({
        actionType: actions.actionType,
        cnt: count(actions.id).as("cnt"),
      })
      .from(actions)
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      )
      .groupBy(actions.actionType);

    const postCount = Number(activityBreakdown.find((a) => a.actionType === "post")?.cnt || 0);
    const commentCount = Number(
      activityBreakdown
        .filter((a) => a.actionType === "comment" || a.actionType === "reply")
        .reduce((sum, a) => sum + Number(a.cnt), 0)
    );

    // Avg sentiment & originality
    const avgScores = await db
      .select({
        avgSentiment: avg(enrichments.sentiment),
        avgOriginality: avg(enrichments.originalityScore),
      })
      .from(enrichments)
      .innerJoin(actions, eq(enrichments.actionId, actions.id))
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    // Upvotes received
    const upvotesResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${actions.upvotes}), 0)`.as("total"),
      })
      .from(actions)
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    // Unique topics
    const uniqueTopicsResult = await db
      .select({
        cnt: sql<number>`COUNT(DISTINCT ${actionTopics.topicId})`.as("cnt"),
      })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    // Unique interlocutors (agents they interacted with)
    const uniqueInterlocutors = await db
      .select({
        cnt: sql<number>`COUNT(DISTINCT ${interactions.targetAgentId})`.as("cnt"),
      })
      .from(interactions)
      .where(
        and(
          eq(interactions.sourceAgentId, agentId),
          gte(interactions.createdAt, date),
          lt(interactions.createdAt, nextDay)
        )
      );

    // Active hours
    const activeHoursResult = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${actions.performedAt})`.as("hour"),
      })
      .from(actions)
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM ${actions.performedAt})`);

    // Word count
    const wordCountResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(LENGTH(${actions.content}) - LENGTH(REPLACE(${actions.content}, ' ', '')) + 1), 0)`.as("total"),
      })
      .from(actions)
      .where(
        and(
          eq(actions.agentId, agentId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay),
          sql`${actions.content} IS NOT NULL`
        )
      );

    // Upsert daily agent stats
    await db
      .insert(dailyAgentStats)
      .values({
        agentId,
        date,
        postCount,
        commentCount,
        upvotesReceived: Number(upvotesResult[0]?.total) || 0,
        avgSentiment: Number(avgScores[0]?.avgSentiment) || null,
        avgOriginality: Number(avgScores[0]?.avgOriginality) || null,
        uniqueTopics: Number(uniqueTopicsResult[0]?.cnt) || 0,
        uniqueInterlocutors: Number(uniqueInterlocutors[0]?.cnt) || 0,
        activeHours: activeHoursResult.map((r) => Number(r.hour)),
        wordCount: Number(wordCountResult[0]?.total) || 0,
      })
      .onConflictDoUpdate({
        target: [dailyAgentStats.agentId, dailyAgentStats.date],
        set: {
          postCount,
          commentCount,
          upvotesReceived: Number(upvotesResult[0]?.total) || 0,
          avgSentiment: Number(avgScores[0]?.avgSentiment) || null,
          avgOriginality: Number(avgScores[0]?.avgOriginality) || null,
          uniqueTopics: Number(uniqueTopicsResult[0]?.cnt) || 0,
          uniqueInterlocutors: Number(uniqueInterlocutors[0]?.cnt) || 0,
          activeHours: activeHoursResult.map((r) => Number(r.hour)),
          wordCount: Number(wordCountResult[0]?.total) || 0,
        },
      });

    agentsAggregated++;
  }

  // 2. Aggregate topic stats for the day
  const allTopicsToday = await db
    .select({ topicId: actionTopics.topicId })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .where(and(gte(actions.performedAt, date), lt(actions.performedAt, nextDay)))
    .groupBy(actionTopics.topicId);

  for (const { topicId } of allTopicsToday) {
    const topicActionCount = await db
      .select({ cnt: count(actionTopics.id) })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .where(
        and(
          eq(actionTopics.topicId, topicId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    const topicAgentCount = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${actions.agentId})`.as("cnt") })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .where(
        and(
          eq(actionTopics.topicId, topicId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    const topicSentiment = await db
      .select({ avg: avg(enrichments.sentiment) })
      .from(actionTopics)
      .innerJoin(actions, eq(actionTopics.actionId, actions.id))
      .innerJoin(enrichments, eq(enrichments.actionId, actions.id))
      .where(
        and(
          eq(actionTopics.topicId, topicId),
          gte(actions.performedAt, date),
          lt(actions.performedAt, nextDay)
        )
      );

    const actionCountVal = Number(topicActionCount[0]?.cnt) || 0;

    await db
      .insert(dailyTopicStats)
      .values({
        topicId,
        date,
        velocity: actionCountVal / 24,
        agentCount: Number(topicAgentCount[0]?.cnt) || 0,
        avgSentiment: Number(topicSentiment[0]?.avg) || null,
        actionCount: actionCountVal,
      })
      .onConflictDoUpdate({
        target: [dailyTopicStats.topicId, dailyTopicStats.date],
        set: {
          velocity: actionCountVal / 24,
          agentCount: Number(topicAgentCount[0]?.cnt) || 0,
          avgSentiment: Number(topicSentiment[0]?.avg) || null,
          actionCount: actionCountVal,
        },
      });

    topicsAggregated++;
  }

  // 3. Compute topic co-occurrences for the day
  // For each action that has multiple topics, increment the co-occurrence count for each pair
  const multiTopicActions = await db
    .select({
      actionId: actionTopics.actionId,
      topicId: actionTopics.topicId,
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .where(and(gte(actions.performedAt, date), lt(actions.performedAt, nextDay)))
    .orderBy(actionTopics.actionId);

  // Group topics by action
  const topicsByAction = new Map<string, string[]>();
  for (const row of multiTopicActions) {
    if (!topicsByAction.has(row.actionId)) topicsByAction.set(row.actionId, []);
    topicsByAction.get(row.actionId)!.push(row.topicId);
  }

  // For each action with 2+ topics, create/increment co-occurrence pairs
  for (const [, topicIds] of topicsByAction) {
    if (topicIds.length < 2) continue;

    for (let i = 0; i < topicIds.length; i++) {
      for (let j = i + 1; j < topicIds.length; j++) {
        // Ensure consistent ordering (smaller ID first)
        const [id1, id2] = topicIds[i] < topicIds[j]
          ? [topicIds[i], topicIds[j]]
          : [topicIds[j], topicIds[i]];

        await db
          .insert(topicCooccurrences)
          .values({
            topicId1: id1,
            topicId2: id2,
            cooccurrenceCount: 1,
            lastSeenAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [topicCooccurrences.topicId1, topicCooccurrences.topicId2],
            set: {
              cooccurrenceCount: sql`${topicCooccurrences.cooccurrenceCount} + 1`,
              lastSeenAt: new Date(),
            },
          });
      }
    }
  }

  return { agentsAggregated, topicsAggregated };
}
