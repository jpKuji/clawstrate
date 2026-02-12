import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

type Row = Record<string, any>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  console.log(`[merge-topics] starting${dryRun ? " (dry-run)" : ""}`);

  if (!dryRun) {
    // (Re)compute name_key from display name for *all* rows.
    // We don't trust existing values: earlier pipeline versions may have populated name_key incorrectly.
    await db.execute(sql`
      UPDATE topics
      SET name_key = lower(trim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
    `);
  }

  const duplicateKeys = await db.execute<{ name_key: string }>(sql`
    SELECT name_key
    FROM topics
    WHERE name_key IS NOT NULL AND name_key <> ''
    GROUP BY name_key
    HAVING COUNT(*) > 1
    ORDER BY name_key
  `);

  const keys = duplicateKeys.rows.map((r) => r.name_key);
  console.log(`[merge-topics] found ${keys.length} duplicate name_key groups`);

  let mergedTopics = 0;

  for (const nameKey of keys) {
    const group = await db.execute<Row>(sql`
      SELECT
        t.id,
        t.slug,
        t.first_seen_at,
        t.last_seen_at,
        COALESCE(edge.cnt, 0)::int AS edge_count
      FROM topics t
      LEFT JOIN (
        SELECT topic_id, COUNT(*)::int AS cnt
        FROM action_topics
        GROUP BY topic_id
      ) edge ON edge.topic_id = t.id
      WHERE t.name_key = ${nameKey}
      ORDER BY edge_count DESC, t.first_seen_at ASC, t.id ASC
    `);

    if (group.rows.length < 2) continue;

    const [canonical, ...others] = group.rows;
    const canonicalId = asString(canonical.id);
    const canonicalSlug = asString(canonical.slug);

    console.log(
      `[merge-topics] name_key="${nameKey}": canonical=${canonicalSlug} (${canonicalId}), merging ${others.length} rows`
    );

    for (const old of others) {
      const oldId = asString(old.id);
      const oldSlug = asString(old.slug);

      mergedTopics++;

      if (dryRun) {
        console.log(`  would merge ${oldSlug} (${oldId}) -> ${canonicalSlug}`);
        continue;
      }

      // Keep old slugs working.
      if (oldSlug && oldSlug !== canonicalSlug) {
        await db.execute(sql`
          INSERT INTO topic_aliases (alias_slug, topic_id)
          VALUES (${oldSlug}, ${canonicalId})
          ON CONFLICT DO NOTHING
        `);
      }

      // Preserve time bounds on the canonical record.
      await db.execute(sql`
        UPDATE topics
        SET
          first_seen_at = CASE
            WHEN topics.first_seen_at IS NULL THEN ${old.first_seen_at}::timestamp
            WHEN ${old.first_seen_at}::timestamp IS NULL THEN topics.first_seen_at
            ELSE LEAST(topics.first_seen_at, ${old.first_seen_at}::timestamp)
          END,
          last_seen_at = CASE
            WHEN topics.last_seen_at IS NULL THEN ${old.last_seen_at}::timestamp
            WHEN ${old.last_seen_at}::timestamp IS NULL THEN topics.last_seen_at
            ELSE GREATEST(topics.last_seen_at, ${old.last_seen_at}::timestamp)
          END
        WHERE id = ${canonicalId}
      `);

      // Merge action-topic edges; preserve max relevance per action.
      await db.execute(sql`
        INSERT INTO action_topics (action_id, topic_id, relevance)
        SELECT action_id, ${canonicalId}, relevance
        FROM action_topics
        WHERE topic_id = ${oldId}
        ON CONFLICT (action_id, topic_id) DO UPDATE
          SET relevance = GREATEST(action_topics.relevance, EXCLUDED.relevance)
      `);
      await db.execute(sql`DELETE FROM action_topics WHERE topic_id = ${oldId}`);

      // Re-point product events.
      await db.execute(
        sql`UPDATE product_events SET topic_id = ${canonicalId} WHERE topic_id = ${oldId}`
      );

      // Merge daily topic stats (agent_count summed; avg_sentiment weighted by action_count).
      await db.execute(sql`
        INSERT INTO daily_topic_stats (topic_id, date, velocity, agent_count, avg_sentiment, action_count)
        SELECT ${canonicalId}, date, velocity, agent_count, avg_sentiment, action_count
        FROM daily_topic_stats
        WHERE topic_id = ${oldId}
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
      await db.execute(sql`DELETE FROM daily_topic_stats WHERE topic_id = ${oldId}`);

      // Merge topic co-occurrences (drop self-pairs after remap).
      await db.execute(sql`
        INSERT INTO topic_cooccurrences (topic_id_1, topic_id_2, date, cooccurrence_count, last_seen_at)
        SELECT
          LEAST(
            CASE WHEN topic_id_1 = ${oldId} THEN ${canonicalId} ELSE topic_id_1 END,
            CASE WHEN topic_id_2 = ${oldId} THEN ${canonicalId} ELSE topic_id_2 END
          ) AS topic_id_1,
          GREATEST(
            CASE WHEN topic_id_1 = ${oldId} THEN ${canonicalId} ELSE topic_id_1 END,
            CASE WHEN topic_id_2 = ${oldId} THEN ${canonicalId} ELSE topic_id_2 END
          ) AS topic_id_2,
          date,
          cooccurrence_count,
          last_seen_at
        FROM topic_cooccurrences
        WHERE (topic_id_1 = ${oldId} OR topic_id_2 = ${oldId})
          AND (
            CASE WHEN topic_id_1 = ${oldId} THEN ${canonicalId} ELSE topic_id_1 END
          ) <> (
            CASE WHEN topic_id_2 = ${oldId} THEN ${canonicalId} ELSE topic_id_2 END
          )
        ON CONFLICT (topic_id_1, topic_id_2, date) DO UPDATE SET
          cooccurrence_count = COALESCE(topic_cooccurrences.cooccurrence_count, 0) + COALESCE(EXCLUDED.cooccurrence_count, 0),
          last_seen_at = GREATEST(
            COALESCE(topic_cooccurrences.last_seen_at, EXCLUDED.last_seen_at),
            COALESCE(EXCLUDED.last_seen_at, topic_cooccurrences.last_seen_at)
          )
      `);
      await db.execute(
        sql`DELETE FROM topic_cooccurrences WHERE topic_id_1 = ${oldId} OR topic_id_2 = ${oldId}`
      );

      // Re-point topic_aliases from old topic to canonical.
      await db.execute(sql`
        UPDATE topic_aliases SET topic_id = ${canonicalId}
        WHERE topic_id = ${oldId}
        AND alias_slug NOT IN (SELECT alias_slug FROM topic_aliases WHERE topic_id = ${canonicalId})
      `);
      await db.execute(sql`DELETE FROM topic_aliases WHERE topic_id = ${oldId}`);

      // Re-point topic_name_aliases from old topic to canonical.
      await db.execute(sql`
        UPDATE topic_name_aliases SET topic_id = ${canonicalId}
        WHERE topic_id = ${oldId}
        AND alias_name_key NOT IN (SELECT alias_name_key FROM topic_name_aliases WHERE topic_id = ${canonicalId})
      `);
      await db.execute(sql`DELETE FROM topic_name_aliases WHERE topic_id = ${oldId}`);

      // Remove any merge proposals referencing the old topic.
      await db.execute(sql`DELETE FROM topic_merge_proposals WHERE canonical_topic_id = ${oldId}`);

      // Remove the old topic row.
      await db.execute(sql`DELETE FROM topics WHERE id = ${oldId}`);
    }
  }

  if (!dryRun) {
    // Recompute action_count from edges to avoid drift.
    await db.execute(sql`
      UPDATE topics
      SET action_count = sub.cnt
      FROM (
        SELECT topic_id, COUNT(*)::int AS cnt
        FROM action_topics
        GROUP BY topic_id
      ) sub
      WHERE topics.id = sub.topic_id
    `);

    await db.execute(sql`
      UPDATE topics
      SET action_count = 0
      WHERE id NOT IN (SELECT DISTINCT topic_id FROM action_topics)
    `);
  }

  console.log(
    `[merge-topics] done${dryRun ? " (dry-run)" : ""}; merged topic rows: ${mergedTopics}`
  );
}

main().catch((e) => {
  console.error("[merge-topics] fatal", e);
  process.exit(1);
});
