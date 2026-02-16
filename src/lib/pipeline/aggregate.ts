import { db } from "../db";
import {
  dailyAgentStats,
  dailyTopicStats,
  topicCooccurrences,
} from "../db/schema";
import { sql } from "drizzle-orm";
import {
  getBootstrapStart,
  getStageCursor,
  GLOBAL_CURSOR_SCOPE,
  setStageCursor,
} from "./cursors";

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>)) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregate daily stats for agents and topics with incremental cursoring.
 */
export async function runAggregation(targetDate?: Date): Promise<{
  agentsAggregated: number;
  topicsAggregated: number;
}> {
  const now = new Date();

  const cursor = targetDate
    ? null
    : await getStageCursor("aggregate", GLOBAL_CURSOR_SCOPE);
  const cursorStart = cursor?.cursorTs ?? getBootstrapStart("aggregate", now);

  let impactedDates: Date[] = [];
  if (targetDate) {
    impactedDates = [startOfUtcDay(targetDate)];
  } else {
    const impactedResult = await db.execute<{ date: Date }>(sql`
      SELECT DISTINCT DATE_TRUNC('day', ts)::timestamp AS date
      FROM (
        SELECT a.performed_at AS ts
        FROM actions a
        WHERE a.ingested_at >= ${cursorStart}

        UNION ALL

        SELECT a.performed_at AS ts
        FROM enrichments e
        INNER JOIN actions a ON a.id = e.action_id
        WHERE e.processed_at >= ${cursorStart}

        UNION ALL

        SELECT i.created_at AS ts
        FROM interactions i
        WHERE i.created_at >= ${cursorStart}
      ) AS impacted
      ORDER BY date ASC
    `);

    impactedDates = extractRows<{ date: Date }>(impactedResult)
      .map((row) => startOfUtcDay(new Date(row.date)))
      .filter((d, idx, list) => list.findIndex((x) => x.getTime() === d.getTime()) === idx);
  }

  if (impactedDates.length === 0) {
    if (!targetDate) {
      await setStageCursor("aggregate", GLOBAL_CURSOR_SCOPE, now, {
        cursorStart: cursorStart.toISOString(),
        reason: "no_changes",
      });
    }
    return { agentsAggregated: 0, topicsAggregated: 0 };
  }

  let agentsAggregated = 0;
  let topicsAggregated = 0;

  for (const date of impactedDates) {
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const [
      coreAgentMetricsResult,
      uniqueTopicsResult,
      uniqueInterlocutorsResult,
      topicDayStatsResult,
      cooccurrenceResult,
    ] = await Promise.all([
      db.execute<{
        agent_id: string;
        post_count: number;
        comment_count: number;
        upvotes_received: number;
        avg_sentiment: number | null;
        avg_originality: number | null;
        active_hours: number[] | null;
        word_count: number;
      }>(sql`
        SELECT
          a.agent_id,
          COUNT(*) FILTER (WHERE a.action_type = 'post')::int AS post_count,
          COUNT(*) FILTER (WHERE a.action_type IN ('comment', 'reply'))::int AS comment_count,
          COALESCE(SUM(a.upvotes), 0)::int AS upvotes_received,
          AVG(e.sentiment)::real AS avg_sentiment,
          AVG(e.originality_score)::real AS avg_originality,
          ARRAY_REMOVE(
            ARRAY_AGG(DISTINCT EXTRACT(HOUR FROM a.performed_at)::int),
            NULL
          ) AS active_hours,
          COALESCE(
            SUM(
              CASE
                WHEN a.content IS NULL OR a.content = '' THEN 0
                ELSE LENGTH(a.content) - LENGTH(REPLACE(a.content, ' ', '')) + 1
              END
            ),
            0
          )::int AS word_count
        FROM actions a
        LEFT JOIN enrichments e ON e.action_id = a.id
        WHERE a.agent_id IS NOT NULL
          AND a.performed_at >= ${date}
          AND a.performed_at < ${nextDay}
        GROUP BY a.agent_id
      `),
      db.execute<{ agent_id: string; unique_topics: number }>(sql`
        SELECT
          a.agent_id,
          COUNT(DISTINCT at.topic_id)::int AS unique_topics
        FROM action_topics at
        INNER JOIN actions a ON a.id = at.action_id
        WHERE a.agent_id IS NOT NULL
          AND a.performed_at >= ${date}
          AND a.performed_at < ${nextDay}
        GROUP BY a.agent_id
      `),
      db.execute<{ agent_id: string; unique_interlocutors: number }>(sql`
        SELECT
          i.source_agent_id AS agent_id,
          COUNT(DISTINCT i.target_agent_id)::int AS unique_interlocutors
        FROM interactions i
        WHERE i.created_at >= ${date}
          AND i.created_at < ${nextDay}
        GROUP BY i.source_agent_id
      `),
      db.execute<{
        topic_id: string;
        action_count: number;
        agent_count: number;
        avg_sentiment: number | null;
      }>(sql`
        SELECT
          at.topic_id,
          COUNT(*)::int AS action_count,
          COUNT(DISTINCT a.agent_id)::int AS agent_count,
          AVG(e.sentiment)::real AS avg_sentiment
        FROM action_topics at
        INNER JOIN actions a ON a.id = at.action_id
        LEFT JOIN enrichments e ON e.action_id = a.id
        WHERE a.performed_at >= ${date}
          AND a.performed_at < ${nextDay}
        GROUP BY at.topic_id
      `),
      db.execute<{ topic_id_1: string; topic_id_2: string; cooccurrence_count: number }>(sql`
        SELECT
          LEAST(t1.topic_id, t2.topic_id) AS topic_id_1,
          GREATEST(t1.topic_id, t2.topic_id) AS topic_id_2,
          COUNT(*)::int AS cooccurrence_count
        FROM action_topics t1
        INNER JOIN action_topics t2
          ON t1.action_id = t2.action_id
         AND t1.topic_id < t2.topic_id
        INNER JOIN actions a ON a.id = t1.action_id
        WHERE a.performed_at >= ${date}
          AND a.performed_at < ${nextDay}
        GROUP BY 1, 2
      `),
    ]);

    const uniqueTopicsByAgent = new Map<string, number>();
    for (const row of extractRows<{ agent_id: string; unique_topics: number }>(uniqueTopicsResult)) {
      uniqueTopicsByAgent.set(row.agent_id, toNumber(row.unique_topics));
    }

    const uniqueInterlocutorsByAgent = new Map<string, number>();
    for (const row of extractRows<{ agent_id: string; unique_interlocutors: number }>(uniqueInterlocutorsResult)) {
      uniqueInterlocutorsByAgent.set(row.agent_id, toNumber(row.unique_interlocutors));
    }

    const coreAgentMetrics = extractRows<{
      agent_id: string;
      post_count: number;
      comment_count: number;
      upvotes_received: number;
      avg_sentiment: number | null;
      avg_originality: number | null;
      active_hours: number[] | null;
      word_count: number;
    }>(coreAgentMetricsResult);

    const dailyAgentValues = coreAgentMetrics.map((row) => ({
      agentId: row.agent_id,
      date,
      postCount: toNumber(row.post_count),
      commentCount: toNumber(row.comment_count),
      upvotesReceived: toNumber(row.upvotes_received),
      avgSentiment: row.avg_sentiment == null ? null : toNumber(row.avg_sentiment, 0),
      avgOriginality: row.avg_originality == null ? null : toNumber(row.avg_originality, 0),
      uniqueTopics: uniqueTopicsByAgent.get(row.agent_id) || 0,
      uniqueInterlocutors: uniqueInterlocutorsByAgent.get(row.agent_id) || 0,
      activeHours: Array.isArray(row.active_hours)
        ? row.active_hours.map((hour) => toNumber(hour)).filter((hour) => hour >= 0 && hour <= 23)
        : [],
      wordCount: toNumber(row.word_count),
    }));

    for (const valueChunk of chunk(dailyAgentValues, 500)) {
      await db
        .insert(dailyAgentStats)
        .values(valueChunk)
        .onConflictDoUpdate({
          target: [dailyAgentStats.agentId, dailyAgentStats.date],
          set: {
            postCount: sql`excluded.post_count`,
            commentCount: sql`excluded.comment_count`,
            upvotesReceived: sql`excluded.upvotes_received`,
            avgSentiment: sql`excluded.avg_sentiment`,
            avgOriginality: sql`excluded.avg_originality`,
            uniqueTopics: sql`excluded.unique_topics`,
            uniqueInterlocutors: sql`excluded.unique_interlocutors`,
            activeHours: sql`excluded.active_hours`,
            wordCount: sql`excluded.word_count`,
          },
        });
    }

    const topicDayStats = extractRows<{
      topic_id: string;
      action_count: number;
      agent_count: number;
      avg_sentiment: number | null;
    }>(topicDayStatsResult);

    const dailyTopicValues = topicDayStats.map((row) => ({
      topicId: row.topic_id,
      date,
      velocity: toNumber(row.action_count) / 24,
      agentCount: toNumber(row.agent_count),
      avgSentiment: row.avg_sentiment == null ? null : toNumber(row.avg_sentiment, 0),
      actionCount: toNumber(row.action_count),
    }));

    for (const valueChunk of chunk(dailyTopicValues, 500)) {
      await db
        .insert(dailyTopicStats)
        .values(valueChunk)
        .onConflictDoUpdate({
          target: [dailyTopicStats.topicId, dailyTopicStats.date],
          set: {
            velocity: sql`excluded.velocity`,
            agentCount: sql`excluded.agent_count`,
            avgSentiment: sql`excluded.avg_sentiment`,
            actionCount: sql`excluded.action_count`,
          },
        });
    }

    const cooccurrenceRows = extractRows<{
      topic_id_1: string;
      topic_id_2: string;
      cooccurrence_count: number;
    }>(cooccurrenceResult).map((row) => ({
      topicId1: row.topic_id_1,
      topicId2: row.topic_id_2,
      date,
      cooccurrenceCount: toNumber(row.cooccurrence_count),
      lastSeenAt: now,
    }));

    for (const valueChunk of chunk(cooccurrenceRows, 500)) {
      await db
        .insert(topicCooccurrences)
        .values(valueChunk)
        .onConflictDoUpdate({
          target: [
            topicCooccurrences.topicId1,
            topicCooccurrences.topicId2,
            topicCooccurrences.date,
          ],
          set: {
            cooccurrenceCount: sql`excluded.cooccurrence_count`,
            lastSeenAt: now,
          },
        });
    }

    agentsAggregated += dailyAgentValues.length;
    topicsAggregated += dailyTopicValues.length;
  }

  if (!targetDate) {
    await setStageCursor("aggregate", GLOBAL_CURSOR_SCOPE, now, {
      cursorStart: cursorStart.toISOString(),
      impactedDays: impactedDates.map((date) => date.toISOString()),
      agentsAggregated,
      topicsAggregated,
    });
  }

  return { agentsAggregated, topicsAggregated };
}
