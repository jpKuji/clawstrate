import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  topics,
  actionTopics,
  actions,
  agents,
  enrichments,
  topicCooccurrences,
  topicAliases,
} from "@/lib/db/schema";
import { eq, desc, or, sql, count, inArray } from "drizzle-orm";
import { extractRows } from "@/lib/onchain/api-utils";

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    let isAlias = false;
    let topic = await db.query.topics.findFirst({
      where: eq(topics.slug, slug),
    });

    if (!topic) {
      const alias = await db.query.topicAliases.findFirst({
        where: eq(topicAliases.aliasSlug, slug),
      });
      if (alias) {
        const canonical = await db.query.topics.findFirst({
          where: eq(topics.id, alias.topicId),
        });
        if (canonical) {
          topic = canonical;
          isAlias = true;
        }
      }
    }

    const onchainAggregateResult = await db.execute<{
      topic_name: string | null;
      action_count: number;
      agent_count: number;
      velocity: number;
      last_seen_at: Date;
    }>(sql`
      SELECT
        MAX(oet.topic_name) AS topic_name,
        COUNT(*)::int AS action_count,
        COUNT(DISTINCT oea.agent_key)::int AS agent_count,
        (COUNT(*) FILTER (WHERE oet.block_time >= NOW() - INTERVAL '24 hours')::real / 24.0) AS velocity,
        MAX(oet.block_time) AS last_seen_at
      FROM onchain_event_topics oet
      LEFT JOIN onchain_event_agents oea
        ON oea.chain_id = oet.chain_id
        AND oea.tx_hash = oet.tx_hash
        AND oea.log_index = oet.log_index
      WHERE oet.topic_slug = ${slug}
    `);

    const onchainAggregate = extractRows<{
      topic_name: string | null;
      action_count: number;
      agent_count: number;
      velocity: number;
      last_seen_at: Date;
    }>(onchainAggregateResult)[0];
    const hasOnchainTopic = asNumber(onchainAggregate?.action_count) > 0;

    if (!topic && !hasOnchainTopic) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const topicId = topic?.id;

    const [canonicalRecentActions, canonicalTopContributors, canonicalCooccurringTopics] =
      topicId
        ? await Promise.all([
            db
              .select({
                action: actions,
                agentName: agents.displayName,
                agentId: agents.id,
                autonomyScore: enrichments.autonomyScore,
                sentiment: enrichments.sentiment,
                isSubstantive: enrichments.isSubstantive,
                intent: enrichments.intent,
              })
              .from(actionTopics)
              .innerJoin(actions, eq(actionTopics.actionId, actions.id))
              .leftJoin(agents, eq(actions.agentId, agents.id))
              .leftJoin(enrichments, eq(enrichments.actionId, actions.id))
              .where(eq(actionTopics.topicId, topicId))
              .orderBy(desc(actions.performedAt))
              .limit(30),
            db
              .select({
                agentId: actions.agentId,
                agentName: agents.displayName,
                actionCount: count(actions.id).as("action_count"),
              })
              .from(actionTopics)
              .innerJoin(actions, eq(actionTopics.actionId, actions.id))
              .innerJoin(agents, eq(actions.agentId, agents.id))
              .where(eq(actionTopics.topicId, topicId))
              .groupBy(actions.agentId, agents.displayName)
              .orderBy(sql`COUNT(${actions.id}) DESC`)
              .limit(10),
            (async () => {
              const pairs = await db
                .select({
                  topicId1: topicCooccurrences.topicId1,
                  topicId2: topicCooccurrences.topicId2,
                  cooccurrenceCount:
                    sql<number>`SUM(${topicCooccurrences.cooccurrenceCount})`.as(
                      "cooccurrence_count"
                    ),
                })
                .from(topicCooccurrences)
                .where(
                  or(
                    eq(topicCooccurrences.topicId1, topicId),
                    eq(topicCooccurrences.topicId2, topicId)
                  )
                )
                .groupBy(topicCooccurrences.topicId1, topicCooccurrences.topicId2)
                .orderBy(
                  desc(
                    sql<number>`SUM(${topicCooccurrences.cooccurrenceCount})`.as(
                      "cooccurrence_count"
                    )
                  )
                )
                .limit(10);

              const relatedTopicIds = pairs.map((row) =>
                row.topicId1 === topicId ? row.topicId2 : row.topicId1
              );
              const relatedTopics =
                relatedTopicIds.length > 0
                  ? await db.query.topics.findMany({
                      where: inArray(topics.id, relatedTopicIds),
                    })
                  : [];

              return pairs.map((row) => {
                const relatedId = row.topicId1 === topicId ? row.topicId2 : row.topicId1;
                const related = relatedTopics.find((item) => item.id === relatedId);
                return {
                  slug: related?.slug || "",
                  name: related?.name || "",
                  count: row.cooccurrenceCount,
                };
              });
            })(),
          ])
        : [[], [], [] as Array<{ slug: string; name: string; count: number }>];

    const [onchainRecentEventsResult, onchainTopContributorsResult, onchainCooccurringResult] =
      hasOnchainTopic
        ? await Promise.all([
            db.execute<{
              chain_id: number;
              tx_hash: string;
              log_index: number;
              block_time: Date;
              standard: string;
              event_name: string;
              agent_keys: string[] | null;
              agent_names: string[] | null;
            }>(sql`
              SELECT
                oel.chain_id,
                oel.tx_hash,
                oel.log_index,
                oel.block_time,
                oel.standard,
                oel.event_name,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT oea.agent_key), NULL) AS agent_keys,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(m.name, oea.agent_key)), NULL) AS agent_names
              FROM onchain_event_topics oet
              INNER JOIN onchain_event_logs oel
                ON oel.chain_id = oet.chain_id
                AND oel.tx_hash = oet.tx_hash
                AND oel.log_index = oet.log_index
              LEFT JOIN onchain_event_agents oea
                ON oea.chain_id = oet.chain_id
                AND oea.tx_hash = oet.tx_hash
                AND oea.log_index = oet.log_index
              LEFT JOIN erc8004_agent_metadata m
                ON m.agent_key = oea.agent_key
              WHERE oet.topic_slug = ${slug}
              GROUP BY oel.chain_id, oel.tx_hash, oel.log_index, oel.block_time, oel.standard, oel.event_name
              ORDER BY oel.block_time DESC, oel.log_index DESC
              LIMIT 30
            `),
            db.execute<{
              agent_key: string;
              agent_name: string;
              action_count: number;
            }>(sql`
              SELECT
                oea.agent_key,
                COALESCE(m.name, oea.agent_key) AS agent_name,
                COUNT(*)::int AS action_count
              FROM onchain_event_topics oet
              INNER JOIN onchain_event_agents oea
                ON oea.chain_id = oet.chain_id
                AND oea.tx_hash = oet.tx_hash
                AND oea.log_index = oet.log_index
              LEFT JOIN erc8004_agent_metadata m
                ON m.agent_key = oea.agent_key
              WHERE oet.topic_slug = ${slug}
              GROUP BY oea.agent_key, COALESCE(m.name, oea.agent_key)
              ORDER BY action_count DESC
              LIMIT 10
            `),
            db.execute<{
              slug: string;
              name: string | null;
              count: number;
            }>(sql`
              SELECT
                related.topic_slug AS slug,
                MAX(related.topic_name) AS name,
                COUNT(*)::int AS count
              FROM onchain_event_topics base
              INNER JOIN onchain_event_topics related
                ON related.chain_id = base.chain_id
                AND related.tx_hash = base.tx_hash
                AND related.log_index = base.log_index
                AND related.topic_slug <> base.topic_slug
              WHERE base.topic_slug = ${slug}
              GROUP BY related.topic_slug
              ORDER BY count DESC
              LIMIT 10
            `),
          ])
        : [null, null, null];

    const onchainRecentActions = extractRows<{
      chain_id: number;
      tx_hash: string;
      log_index: number;
      block_time: Date;
      standard: string;
      event_name: string;
      agent_keys: string[] | null;
      agent_names: string[] | null;
    }>(onchainRecentEventsResult || { rows: [] }).map((row) => {
      const agentKeys = Array.isArray(row.agent_keys) ? row.agent_keys : [];
      const agentNames = Array.isArray(row.agent_names) ? row.agent_names : [];
      const firstAgentKey = agentKeys[0] || null;
      const firstAgentName = agentNames[0] || firstAgentKey;

      return {
        action: {
          id: `${row.chain_id}:${row.tx_hash}:${row.log_index}`,
          title: `${row.standard.toUpperCase()} ${row.event_name}`,
          content: null,
          url: null,
          actionType: row.event_name,
          performedAt: asDateIso(row.block_time),
          upvotes: null,
        },
        agentName: firstAgentName,
        agentId: firstAgentKey ? `onchain:${firstAgentKey}` : null,
        autonomyScore: null,
        sentiment: null,
        isSubstantive: true,
        intent: "onchain_event",
      };
    });

    const onchainTopContributors = extractRows<{
      agent_key: string;
      agent_name: string;
      action_count: number;
    }>(onchainTopContributorsResult || { rows: [] }).map((row) => ({
      agentId: `onchain:${row.agent_key}`,
      agentName: row.agent_name,
      actionCount: asNumber(row.action_count),
    }));

    const onchainCooccurringTopics = extractRows<{
      slug: string;
      name: string | null;
      count: number;
    }>(onchainCooccurringResult || { rows: [] }).map((row) => ({
      slug: row.slug,
      name: row.name || titleFromSlug(row.slug),
      count: asNumber(row.count),
    }));

    const mergedRecentActions = [...canonicalRecentActions, ...onchainRecentActions]
      .sort((a, b) => {
        const aTs = new Date(a.action.performedAt).getTime();
        const bTs = new Date(b.action.performedAt).getTime();
        return bTs - aTs;
      })
      .slice(0, 40);

    const contributorMap = new Map<string, { agentId: string | null; agentName: string | null; actionCount: number }>();
    for (const contributor of [...canonicalTopContributors, ...onchainTopContributors]) {
      const key = contributor.agentId || contributor.agentName || "unknown";
      const existing = contributorMap.get(key);
      if (!existing) {
        contributorMap.set(key, contributor);
      } else {
        existing.actionCount += contributor.actionCount;
      }
    }

    const mergedTopContributors = Array.from(contributorMap.values())
      .sort((a, b) => b.actionCount - a.actionCount)
      .slice(0, 10);

    const cooccurMap = new Map<string, { slug: string; name: string; count: number }>();
    for (const related of [...canonicalCooccurringTopics, ...onchainCooccurringTopics]) {
      if (!related.slug) continue;
      const existing = cooccurMap.get(related.slug);
      if (!existing) {
        cooccurMap.set(related.slug, {
          slug: related.slug,
          name: related.name,
          count: asNumber(related.count),
        });
      } else {
        existing.count += asNumber(related.count);
      }
    }

    const mergedCooccurringTopics = Array.from(cooccurMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const mergedTopic = topic
      ? {
          ...topic,
          velocity: (topic.velocity ?? 0) + (hasOnchainTopic ? asNumber(onchainAggregate?.velocity) : 0),
          actionCount:
            (topic.actionCount ?? 0) +
            (hasOnchainTopic ? asNumber(onchainAggregate?.action_count) : 0),
          agentCount:
            (topic.agentCount ?? 0) +
            (hasOnchainTopic ? asNumber(onchainAggregate?.agent_count) : 0),
          lastSeenAt:
            hasOnchainTopic && onchainAggregate?.last_seen_at
              ? new Date(
                  Math.max(
                    new Date(topic.lastSeenAt || 0).getTime(),
                    new Date(onchainAggregate.last_seen_at).getTime()
                  )
                )
              : topic.lastSeenAt,
        }
      : {
          id: `onchain:${slug}`,
          slug,
          name: (onchainAggregate?.topic_name || titleFromSlug(slug)).trim(),
          description: "Onchain-derived topic from protocol event semantics.",
          velocity: asNumber(onchainAggregate?.velocity),
          actionCount: asNumber(onchainAggregate?.action_count),
          agentCount: asNumber(onchainAggregate?.agent_count),
          avgSentiment: null,
          firstSeenAt: null,
          lastSeenAt: onchainAggregate?.last_seen_at || null,
          metadata: { source: "onchain" },
          nameKey: null,
        };

    return NextResponse.json({
      requestedSlug: slug,
      canonicalSlug: topic?.slug || slug,
      isAlias,
      topic: mergedTopic,
      recentActions: mergedRecentActions,
      cooccurringTopics: mergedCooccurringTopics,
      topContributors: mergedTopContributors,
    });
  } catch (e: any) {
    console.error("GET /api/v1/topics/[slug] failed", {
      slug,
      message: e?.message,
      cause: e?.cause?.message || e?.cause,
      stack: e?.stack,
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
