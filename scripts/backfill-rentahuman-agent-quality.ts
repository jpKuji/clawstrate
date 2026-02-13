import { addDays, startOfDay } from "date-fns";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  classifyRentAHumanActor,
  formatAgentDisplayLabel,
  mergeActorKindIntoRawProfile,
} from "../src/lib/agents/classify";
import { runAggregation } from "../src/lib/pipeline/aggregate";
import { runAnalysis } from "../src/lib/pipeline/analyze";

type IdentityRow = {
  identity_id: string;
  agent_id: string;
  display_name: string | null;
  platform_user_id: string;
  raw_profile: Record<string, unknown> | null;
  bounty_posts: number;
  assignment_comments: number;
};

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>)) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

async function backfillIdentityClassification() {
  const result = await db.execute<IdentityRow>(sql`
    SELECT
      ai.id AS identity_id,
      ai.agent_id,
      a.display_name,
      ai.platform_user_id,
      ai.raw_profile,
      COUNT(act.id) FILTER (
        WHERE act.action_type = 'post'
          AND COALESCE(act.raw_data->>'kind', 'bounty') = 'bounty'
      )::int AS bounty_posts,
      COUNT(act.id) FILTER (
        WHERE COALESCE(act.raw_data->>'kind', '') = 'assignment'
      )::int AS assignment_comments
    FROM agent_identities ai
    INNER JOIN agents a ON a.id = ai.agent_id
    LEFT JOIN actions act
      ON act.agent_id = ai.agent_id
     AND act.platform_id = 'rentahuman'
    WHERE ai.platform_id = 'rentahuman'
    GROUP BY ai.id, ai.agent_id, a.display_name, ai.platform_user_id, ai.raw_profile
    ORDER BY ai.created_at ASC
  `);

  const rows = extractRows<IdentityRow>(result);
  let identityUpdates = 0;
  let agentLabelUpdates = 0;

  for (const row of rows) {
    const classification = classifyRentAHumanActor({
      bountyPosts: Number(row.bounty_posts || 0),
      assignmentComments: Number(row.assignment_comments || 0),
    });
    const displayLabel = formatAgentDisplayLabel({
      displayName: row.display_name,
      platformId: "rentahuman",
      platformUserId: row.platform_user_id,
    });
    const profilePatch = mergeActorKindIntoRawProfile(
      row.raw_profile || {},
      classification
    );

    await db.execute(sql`
      UPDATE agent_identities
      SET
        raw_profile = COALESCE(raw_profile, '{}'::jsonb) || ${JSON.stringify(profilePatch)}::jsonb,
        platform_username = ${displayLabel},
        last_synced_at = NOW()
      WHERE id = ${row.identity_id}
    `);
    identityUpdates++;

    await db.execute(sql`
      UPDATE agents
      SET display_name = ${displayLabel}
      WHERE id = ${row.agent_id}
    `);
    agentLabelUpdates++;
  }

  return {
    scanned: rows.length,
    identityUpdates,
    agentLabelUpdates,
  };
}

async function deterministicAssignmentEnrichmentBackfill() {
  const inserted = await db.execute<{ inserted: number }>(sql`
    WITH pending AS (
      SELECT a.id, a.content
      FROM actions a
      LEFT JOIN enrichments e ON e.action_id = a.id
      WHERE a.platform_id = 'rentahuman'
        AND COALESCE(a.raw_data->>'kind', '') = 'assignment'
        AND e.id IS NULL
    ),
    inserted_rows AS (
      INSERT INTO enrichments (
        action_id,
        sentiment,
        autonomy_score,
        is_substantive,
        intent,
        originality_score,
        independence_score,
        coordination_signal,
        entities,
        topic_slugs,
        raw_response,
        model
      )
      SELECT
        p.id,
        0,
        0,
        false,
        'marketplace_assignment',
        0,
        0,
        0,
        '[]'::jsonb,
        '[]'::jsonb,
        '{"strategy":"deterministic","reason":"rentahuman_assignment_backfill"}'::jsonb,
        'deterministic-rentahuman-v1'
      FROM pending p
      ON CONFLICT (action_id) DO NOTHING
      RETURNING action_id
    )
    SELECT COUNT(*)::int AS inserted FROM inserted_rows
  `);

  const insertedRows = extractRows<{ inserted: number }>(inserted);
  const insertedCount = Number(insertedRows[0]?.inserted || 0);

  const marked = await db.execute<{ updated: number }>(sql`
    WITH updated_rows AS (
      UPDATE actions
      SET is_enriched = true
      WHERE platform_id = 'rentahuman'
        AND COALESCE(raw_data->>'kind', '') = 'assignment'
      RETURNING id
    )
    SELECT COUNT(*)::int AS updated FROM updated_rows
  `);
  const updatedRows = extractRows<{ updated: number }>(marked);

  return {
    enrichmentsInserted: insertedCount,
    actionsMarkedEnriched: Number(updatedRows[0]?.updated || 0),
  };
}

async function backfillDailyAggregationRange() {
  const rangeResult = await db.execute<{ min_at: Date | null; max_at: Date | null }>(sql`
    SELECT
      MIN(performed_at) AS min_at,
      MAX(performed_at) AS max_at
    FROM actions
    WHERE platform_id = 'rentahuman'
  `);
  const range = extractRows<{ min_at: Date | null; max_at: Date | null }>(
    rangeResult
  )[0];

  if (!range?.min_at || !range?.max_at) {
    return { daysProcessed: 0 };
  }

  let cursor = startOfDay(new Date(range.min_at));
  const end = startOfDay(new Date(range.max_at));
  let daysProcessed = 0;

  while (cursor.getTime() <= end.getTime()) {
    await runAggregation(cursor);
    daysProcessed++;
    cursor = addDays(cursor, 1);
  }

  return { daysProcessed };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  console.log("[backfill-rentahuman] starting");

  const identityStats = await backfillIdentityClassification();
  console.log("[backfill-rentahuman] identity backfill", identityStats);

  const deterministicStats = await deterministicAssignmentEnrichmentBackfill();
  console.log("[backfill-rentahuman] deterministic enrichment backfill", deterministicStats);

  const aggregateStats = await backfillDailyAggregationRange();
  console.log("[backfill-rentahuman] aggregation backfill", aggregateStats);

  const analysisStats = await runAnalysis();
  console.log("[backfill-rentahuman] analysis recompute", analysisStats);

  console.log("[backfill-rentahuman] completed");
}

main().catch((error) => {
  console.error("[backfill-rentahuman] fatal", error);
  process.exit(1);
});
