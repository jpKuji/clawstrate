import { db } from "@/lib/db";
import {
  actionTopics,
  dailyTopicStats,
  productEvents,
  topicAliases,
  topicCooccurrences,
  topicNameAliases,
  topicMergeProposals,
  topics,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Merge "fromTopicId" into "toTopicId". Writes slug + name_key aliases.
export async function mergeTopicIntoCanonical(opts: {
  canonicalTopicId: string;
  mergeTopicId: string;
}): Promise<void> {
  const { canonicalTopicId, mergeTopicId } = opts;

  const canonical = await db.query.topics.findFirst({
    where: eq(topics.id, canonicalTopicId),
  });
  const from = await db.query.topics.findFirst({
    where: eq(topics.id, mergeTopicId),
  });

  if (!canonical) throw new Error(`canonical topic not found: ${canonicalTopicId}`);
  if (!from) return; // already merged/deleted
  if (from.id === canonical.id) return;

  // Aliases: preserve both slug and name_key.
  if (from.slug && from.slug !== canonical.slug) {
    await db.insert(topicAliases).values({ aliasSlug: from.slug, topicId: canonical.id }).onConflictDoNothing();
  }
  if (from.nameKey) {
    await db
      .insert(topicNameAliases)
      .values({ aliasNameKey: from.nameKey, topicId: canonical.id })
      .onConflictDoNothing();
  }

  // Preserve time bounds.
  await db.execute(sql`
    UPDATE topics
    SET
      first_seen_at = CASE
        WHEN topics.first_seen_at IS NULL THEN ${from.firstSeenAt}::timestamp
        WHEN ${from.firstSeenAt}::timestamp IS NULL THEN topics.first_seen_at
        ELSE LEAST(topics.first_seen_at, ${from.firstSeenAt}::timestamp)
      END,
      last_seen_at = CASE
        WHEN topics.last_seen_at IS NULL THEN ${from.lastSeenAt}::timestamp
        WHEN ${from.lastSeenAt}::timestamp IS NULL THEN topics.last_seen_at
        ELSE GREATEST(topics.last_seen_at, ${from.lastSeenAt}::timestamp)
      END
    WHERE id = ${canonical.id}
  `);

  // Merge edges; preserve max relevance per action.
  await db.execute(sql`
    INSERT INTO action_topics (action_id, topic_id, relevance)
    SELECT action_id, ${canonical.id}, relevance
    FROM action_topics
    WHERE topic_id = ${from.id}
    ON CONFLICT (action_id, topic_id) DO UPDATE
      SET relevance = GREATEST(action_topics.relevance, EXCLUDED.relevance)
  `);
  await db.delete(actionTopics).where(eq(actionTopics.topicId, from.id));

  // Re-point product events.
  await db.update(productEvents).set({ topicId: canonical.id }).where(eq(productEvents.topicId, from.id));

  // Merge daily topic stats into canonical (agent_count summed; avg_sentiment weighted by action_count).
  await db.execute(sql`
    INSERT INTO daily_topic_stats (topic_id, date, velocity, agent_count, avg_sentiment, action_count)
    SELECT ${canonical.id}, date, velocity, agent_count, avg_sentiment, action_count
    FROM daily_topic_stats
    WHERE topic_id = ${from.id}
    ON CONFLICT (topic_id, date) DO UPDATE SET
      action_count = daily_topic_stats.action_count + EXCLUDED.action_count,
      agent_count = daily_topic_stats.agent_count + EXCLUDED.agent_count,
      avg_sentiment = CASE
        WHEN (COALESCE(daily_topic_stats.action_count, 0) + COALESCE(EXCLUDED.action_count, 0)) = 0 THEN NULL
        ELSE (
          COALESCE(daily_topic_stats.avg_sentiment, 0) * COALESCE(daily_topic_stats.action_count, 0) +
          COALESCE(EXCLUDED.avg_sentiment, 0) * COALESCE(EXCLUDED.action_count, 0)
        ) / NULLIF((COALESCE(daily_topic_stats.action_count, 0) + COALESCE(EXCLUDED.action_count, 0)), 0)
      END,
      velocity = (daily_topic_stats.action_count + EXCLUDED.action_count) / 24.0
  `);
  await db.delete(dailyTopicStats).where(eq(dailyTopicStats.topicId, from.id));

  // Merge co-occurrences (drop self-pairs after remap).
  await db.execute(sql`
    INSERT INTO topic_cooccurrences (topic_id_1, topic_id_2, date, cooccurrence_count, last_seen_at)
    SELECT
      LEAST(
        CASE WHEN topic_id_1 = ${from.id} THEN ${canonical.id} ELSE topic_id_1 END,
        CASE WHEN topic_id_2 = ${from.id} THEN ${canonical.id} ELSE topic_id_2 END
      ) AS topic_id_1,
      GREATEST(
        CASE WHEN topic_id_1 = ${from.id} THEN ${canonical.id} ELSE topic_id_1 END,
        CASE WHEN topic_id_2 = ${from.id} THEN ${canonical.id} ELSE topic_id_2 END
      ) AS topic_id_2,
      date,
      cooccurrence_count,
      last_seen_at
    FROM topic_cooccurrences
    WHERE (topic_id_1 = ${from.id} OR topic_id_2 = ${from.id})
      AND (
        CASE WHEN topic_id_1 = ${from.id} THEN ${canonical.id} ELSE topic_id_1 END
      ) <> (
        CASE WHEN topic_id_2 = ${from.id} THEN ${canonical.id} ELSE topic_id_2 END
      )
    ON CONFLICT (topic_id_1, topic_id_2, date) DO UPDATE SET
      cooccurrence_count = COALESCE(topic_cooccurrences.cooccurrence_count, 0) + COALESCE(EXCLUDED.cooccurrence_count, 0),
      last_seen_at = GREATEST(
        COALESCE(topic_cooccurrences.last_seen_at, EXCLUDED.last_seen_at),
        COALESCE(EXCLUDED.last_seen_at, topic_cooccurrences.last_seen_at)
      )
  `);
  await db
    .delete(topicCooccurrences)
    .where(
      sql`${topicCooccurrences.topicId1} = ${from.id} OR ${topicCooccurrences.topicId2} = ${from.id}`
    );

  // Remove merged topic.
  await db.delete(topics).where(eq(topics.id, from.id));
}

export async function applyTopicMergeProposal(opts: {
  proposalId: string;
  force?: boolean;
}): Promise<{ merged: number }> {
  const proposal = await db.query.topicMergeProposals.findFirst({
    where: eq(topicMergeProposals.id, opts.proposalId),
  });
  if (!proposal) throw new Error(`proposal not found: ${opts.proposalId}`);

  if (!opts.force && proposal.status !== "approved") {
    throw new Error(`proposal status must be 'approved' (got '${proposal.status}')`);
  }

  const canonicalTopicId = proposal.canonicalTopicId;
  const mergeTopicIds = proposal.mergeTopicIds || [];
  if (!canonicalTopicId) throw new Error("proposal missing canonicalTopicId");
  if (mergeTopicIds.length === 0) throw new Error("proposal missing mergeTopicIds");

  let merged = 0;
  for (const id of mergeTopicIds) {
    await mergeTopicIntoCanonical({ canonicalTopicId, mergeTopicId: id });
    merged++;
  }

  // Recompute action_count for canonical to avoid drift.
  await db.execute(sql`
    UPDATE topics
    SET action_count = sub.cnt
    FROM (
      SELECT topic_id, COUNT(*)::int AS cnt
      FROM action_topics
      WHERE topic_id = ${canonicalTopicId}
      GROUP BY topic_id
    ) sub
    WHERE topics.id = sub.topic_id
  `);

  await db
    .update(topicMergeProposals)
    .set({ status: "applied", appliedAt: new Date() })
    .where(eq(topicMergeProposals.id, proposal.id));

  return { merged };
}

