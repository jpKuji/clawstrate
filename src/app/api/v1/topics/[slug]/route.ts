import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  topics,
  actionTopics,
  actions,
  agents,
  enrichments,
  topicCooccurrences,
} from "@/lib/db/schema";
import { eq, desc, or, sql, count, inArray } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const topic = await db.query.topics.findFirst({
    where: eq(topics.slug, slug),
  });

  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get recent actions for this topic
  const topicActions = await db
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
    .where(eq(actionTopics.topicId, topic.id))
    .orderBy(desc(actions.performedAt))
    .limit(30);

  // Co-occurring topics (Phase 2.5)
  const cooccurring = await db
    .select({
      cooccurrenceCount:
        sql<number>`SUM(${topicCooccurrences.cooccurrenceCount})`.as(
          "cooccurrence_count"
        ),
      relatedTopicId: sql<string>`CASE WHEN ${topicCooccurrences.topicId1} = ${topic.id} THEN ${topicCooccurrences.topicId2} ELSE ${topicCooccurrences.topicId1} END`.as("related_topic_id"),
    })
    .from(topicCooccurrences)
    .where(
      or(
        eq(topicCooccurrences.topicId1, topic.id),
        eq(topicCooccurrences.topicId2, topic.id)
      )
    )
    .groupBy(
      sql`CASE WHEN ${topicCooccurrences.topicId1} = ${topic.id} THEN ${topicCooccurrences.topicId2} ELSE ${topicCooccurrences.topicId1} END`
    )
    .orderBy(
      desc(
        sql<number>`SUM(${topicCooccurrences.cooccurrenceCount})`.as(
          "cooccurrence_count"
        )
      )
    )
    .limit(10);

  // Get topic names for co-occurring topics
  const relatedTopicIds = cooccurring.map((c) => c.relatedTopicId);
  const relatedTopics =
    relatedTopicIds.length > 0
      ? await db.query.topics.findMany({
          where: inArray(topics.id, relatedTopicIds),
        })
      : [];

  const cooccurringTopics = cooccurring.map((c) => {
    const related = relatedTopics.find((t) => t.id === c.relatedTopicId);
    return {
      slug: related?.slug || "",
      name: related?.name || "",
      count: c.cooccurrenceCount,
    };
  });

  // Top contributors for this topic
  const topContributors = await db
    .select({
      agentId: actions.agentId,
      agentName: agents.displayName,
      actionCount: count(actions.id).as("action_count"),
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .innerJoin(agents, eq(actions.agentId, agents.id))
    .where(eq(actionTopics.topicId, topic.id))
    .groupBy(actions.agentId, agents.displayName)
    .orderBy(sql`COUNT(${actions.id}) DESC`)
    .limit(10);

  return NextResponse.json({
    topic,
    recentActions: topicActions,
    cooccurringTopics,
    topContributors,
  });
}
