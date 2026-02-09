import { db } from "../db";
import {
  agents,
  actions,
  enrichments,
  interactions,
  agentProfiles,
  topics,
  actionTopics,
} from "../db/schema";
import { eq, desc, gte, sql, count, avg } from "drizzle-orm";
import { subHours } from "date-fns";

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

  // 1. Compute influence scores (simplified — based on incoming interactions)
  const agentInfluence = await db
    .select({
      agentId: interactions.targetAgentId,
      totalWeight: sql<number>`SUM(${interactions.weight})`.as("total_weight"),
      interactionCount: count(interactions.id).as("interaction_count"),
    })
    .from(interactions)
    .where(gte(interactions.createdAt, last7d))
    .groupBy(interactions.targetAgentId);

  // Normalize influence scores to 0-1
  const maxWeight = Math.max(
    ...agentInfluence.map((a) => Number(a.totalWeight) || 0),
    1
  );

  let agentsUpdated = 0;

  for (const ai of agentInfluence) {
    const influenceScore = Number(ai.totalWeight) / maxWeight;

    // Get average autonomy score for this agent's actions
    const agentEnrichments = await db
      .select({
        avgAutonomy: avg(enrichments.autonomyScore).as("avg_autonomy"),
      })
      .from(enrichments)
      .innerJoin(actions, eq(enrichments.actionId, actions.id))
      .where(eq(actions.agentId, ai.agentId));

    const autonomyScore = Number(agentEnrichments[0]?.avgAutonomy) || 0;

    // Get activity breakdown
    const activityBreakdown = await db
      .select({
        actionType: actions.actionType,
        count: count(actions.id).as("count"),
      })
      .from(actions)
      .where(eq(actions.agentId, ai.agentId))
      .groupBy(actions.actionType);

    const postCount =
      activityBreakdown.find((a) => a.actionType === "post")?.count || 0;
    const commentCount =
      activityBreakdown.find(
        (a) => a.actionType === "comment" || a.actionType === "reply"
      )?.count || 0;

    // Compute activity score (actions in last 24h, normalized)
    const recentActions = await db
      .select({ count: count(actions.id) })
      .from(actions)
      .where(
        sql`${actions.agentId} = ${ai.agentId} AND ${actions.performedAt} >= ${last24h}`
      );

    const activityScore = Math.min(
      (Number(recentActions[0]?.count) || 0) / 20,
      1.0
    );

    // Classify agent type
    const total = Number(postCount) + Number(commentCount);
    let agentType = "lurker";
    if (total > 50 && Number(postCount) > Number(commentCount) * 2)
      agentType = "content_creator";
    else if (total > 50 && Number(commentCount) > Number(postCount) * 3)
      agentType = "commenter";
    else if (total > 20) agentType = "active";
    else if (autonomyScore < 0.2 && total > 30) agentType = "bot_farm";

    // Update agent
    await db
      .update(agents)
      .set({
        influenceScore,
        autonomyScore,
        activityScore,
        agentType,
      })
      .where(eq(agents.id, ai.agentId));

    // Save profile snapshot
    await db.insert(agentProfiles).values({
      agentId: ai.agentId,
      influenceScore,
      autonomyScore,
      activityScore,
      agentType,
      postCount: Number(postCount),
      commentCount: Number(commentCount),
    });

    agentsUpdated++;
  }

  // 2. Update topic stats
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
