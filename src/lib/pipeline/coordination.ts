import { db } from "../db";
import {
  actions,
  agents,
  interactions,
  actionTopics,
  topics,
  coordinationSignals,
} from "../db/schema";
import { eq, and, gte, inArray, count } from "drizzle-orm";
import { subDays, subHours } from "date-fns";
import { createHash } from "crypto";

function stableHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function twoHourBucket(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  const currentHour = d.getUTCHours();
  d.setUTCHours(Math.floor(currentHour / 2) * 2);
  return d;
}

/**
 * Detect coordination patterns among agents.
 * Call after analyze pipeline completes.
 */
export async function detectCoordination(): Promise<{
  signalsDetected: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let signalsDetected = 0;

  try {
    const temporalSignals = await detectTemporalClustering();
    signalsDetected += temporalSignals;
  } catch (e: any) {
    errors.push(`temporal clustering: ${e.message}`);
  }

  try {
    const similaritySignals = await detectContentSimilarity();
    signalsDetected += similaritySignals;
  } catch (e: any) {
    errors.push(`content similarity: ${e.message}`);
  }

  try {
    const cliqueSignals = await detectReplyCliques();
    signalsDetected += cliqueSignals;
  } catch (e: any) {
    errors.push(`reply cliques: ${e.message}`);
  }

  return { signalsDetected, errors };
}

/**
 * Method 1: Temporal clustering
 * Detect 3+ unconnected agents posting on the same topic within a 2h window.
 */
async function detectTemporalClustering(): Promise<number> {
  const last24h = subHours(new Date(), 24);
  let signalsFound = 0;

  // Get all topics with actions in the last 24h
  const recentTopicActions = await db
    .select({
      topicId: actionTopics.topicId,
      topicSlug: topics.slug,
      agentId: actions.agentId,
      performedAt: actions.performedAt,
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .innerJoin(topics, eq(actionTopics.topicId, topics.id))
    .where(gte(actions.performedAt, last24h))
    .orderBy(actionTopics.topicId, actions.performedAt);

  // Group by topic
  const byTopic = new Map<
    string,
    Array<{ agentId: string | null; performedAt: Date; topicSlug: string }>
  >();
  for (const row of recentTopicActions) {
    if (!byTopic.has(row.topicId)) byTopic.set(row.topicId, []);
    byTopic.get(row.topicId)!.push(row);
  }

  for (const [topicId, topicActions] of byTopic) {
    // Sliding 2-hour window
    for (let i = 0; i < topicActions.length; i++) {
      const windowStart = new Date(topicActions[i].performedAt).getTime();
      const windowEnd = windowStart + 2 * 60 * 60 * 1000;

      const agentsInWindow = new Set<string>();
      for (let j = i; j < topicActions.length; j++) {
        const t = new Date(topicActions[j].performedAt).getTime();
        if (t > windowEnd) break;
        if (topicActions[j].agentId)
          agentsInWindow.add(topicActions[j].agentId!);
      }

      if (agentsInWindow.size >= 3) {
        const agentIds = Array.from(agentsInWindow);

        // Check if these agents are mostly unconnected (not already interacting)
        const mutualInteractions = await db
          .select({ count: count(interactions.id) })
          .from(interactions)
          .where(
            and(
              inArray(interactions.sourceAgentId, agentIds),
              inArray(interactions.targetAgentId, agentIds)
            )
          );

        const interactionCount = Number(mutualInteractions[0]?.count) || 0;
        const maxPossible = agentIds.length * (agentIds.length - 1);

        // If low interaction density, this is suspicious
        if (maxPossible > 0 && interactionCount / maxPossible < 0.3) {
          const confidence = Math.min(
            0.5 + (agentsInWindow.size - 3) * 0.1,
            0.95
          );
          const sortedAgentIds = [...agentIds].sort();
          const bucketStart = twoHourBucket(new Date(windowStart));
          const bucketEnd = new Date(bucketStart.getTime() + 2 * 60 * 60 * 1000);
          const signalHash = stableHash({
            topicId,
            agents: sortedAgentIds,
          });

          const inserted = await db
            .insert(coordinationSignals)
            .values({
              signalType: "temporal_cluster",
              signalHash,
              windowStart: bucketStart,
              windowEnd: bucketEnd,
              confidence,
              agentIds: sortedAgentIds,
              evidence: `${agentIds.length} unconnected agents posted about "${topicActions[i].topicSlug}" within 2h window. Only ${interactionCount}/${maxPossible} possible interactions exist.`,
            })
            .onConflictDoNothing({
              target: [
                coordinationSignals.signalType,
                coordinationSignals.signalHash,
                coordinationSignals.windowStart,
              ],
            })
            .returning({ id: coordinationSignals.id });
          if (inserted.length > 0) signalsFound++;
        }
      }
    }
  }

  return signalsFound;
}

/**
 * Method 2: Content similarity
 * Jaccard similarity > 0.8 on topic vectors over 7 days.
 */
async function detectContentSimilarity(): Promise<number> {
  const now = new Date();
  const last7d = subDays(now, 7);
  let signalsFound = 0;

  // Build topic vector per agent (which topics they post about)
  const agentTopics = await db
    .select({
      agentId: actions.agentId,
      topicId: actionTopics.topicId,
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .where(gte(actions.performedAt, last7d));

  const topicVectors = new Map<string, Set<string>>();
  for (const row of agentTopics) {
    if (!row.agentId) continue;
    if (!topicVectors.has(row.agentId))
      topicVectors.set(row.agentId, new Set());
    topicVectors.get(row.agentId)!.add(row.topicId);
  }

  // Compare all pairs (only agents with 3+ topics to avoid noise)
  const agentIds = Array.from(topicVectors.entries())
    .filter(([, topicSet]) => topicSet.size >= 3)
    .map(([id]) => id);

  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const setA = topicVectors.get(agentIds[i])!;
      const setB = topicVectors.get(agentIds[j])!;

      // Jaccard similarity
      const intersection = new Set([...setA].filter((x) => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      const similarity = intersection.size / union.size;

      if (similarity > 0.8) {
        const sortedAgentIds = [agentIds[i], agentIds[j]].sort();
        const signalHash = stableHash({
          agents: sortedAgentIds,
          sharedTopicCount: intersection.size,
        });
        const inserted = await db
          .insert(coordinationSignals)
          .values({
            signalType: "content_similarity",
            signalHash,
            windowStart: last7d,
            windowEnd: now,
            confidence: similarity,
            agentIds: sortedAgentIds,
            evidence: `Jaccard topic similarity of ${similarity.toFixed(2)} over 7 days. ${intersection.size} shared topics out of ${union.size} total.`,
          })
          .onConflictDoNothing({
            target: [
              coordinationSignals.signalType,
              coordinationSignals.signalHash,
              coordinationSignals.windowStart,
            ],
          })
          .returning({ id: coordinationSignals.id });
        if (inserted.length > 0) signalsFound++;
      }
    }
  }

  return signalsFound;
}

/**
 * Method 3: Reply clique detection
 * Groups where > 80% of interactions are within the group.
 */
async function detectReplyCliques(): Promise<number> {
  const now = new Date();
  const last7d = subDays(now, 7);
  let signalsFound = 0;

  // Get all recent interactions
  const recentInteractions = await db
    .select({
      sourceAgentId: interactions.sourceAgentId,
      targetAgentId: interactions.targetAgentId,
    })
    .from(interactions)
    .where(gte(interactions.createdAt, last7d));

  // Build adjacency map
  const adjacency = new Map<string, Set<string>>();
  for (const inter of recentInteractions) {
    if (!adjacency.has(inter.sourceAgentId))
      adjacency.set(inter.sourceAgentId, new Set());
    adjacency.get(inter.sourceAgentId)!.add(inter.targetAgentId);
  }

  // Find potential cliques using a simplified approach:
  // For each agent, check if their interaction partners form a tight group
  const allAgentIds = Array.from(adjacency.keys());
  const checkedGroups = new Set<string>();

  for (const agentId of allAgentIds) {
    const partners = adjacency.get(agentId);
    if (!partners || partners.size < 2) continue;

    // Form candidate group: agent + all partners
    const group = new Set([agentId, ...partners]);
    if (group.size < 3) continue;

    // Create deterministic key to avoid checking same group twice
    const groupKey = Array.from(group).sort().join(",");
    if (checkedGroups.has(groupKey)) continue;
    checkedGroups.add(groupKey);

    const groupArray = Array.from(group);

    // Count internal vs total interactions for the group
    let internalCount = 0;
    let totalCount = 0;

    for (const memberId of groupArray) {
      const memberPartners = adjacency.get(memberId);
      if (!memberPartners) continue;

      for (const partner of memberPartners) {
        totalCount++;
        if (group.has(partner)) internalCount++;
      }
    }

    if (totalCount > 0 && internalCount / totalCount > 0.8) {
      const confidence = Math.min(
        0.6 + (internalCount / totalCount - 0.8) * 2,
        0.95
      );
      const sortedAgentIds = [...groupArray].sort();
      const signalHash = stableHash({
        agents: sortedAgentIds,
        internalCount,
        totalCount,
      });

      const inserted = await db
        .insert(coordinationSignals)
        .values({
          signalType: "reply_clique",
          signalHash,
          windowStart: last7d,
          windowEnd: now,
          confidence,
          agentIds: sortedAgentIds,
          evidence: `${groupArray.length}-agent clique with ${((internalCount / totalCount) * 100).toFixed(0)}% internal interactions (${internalCount}/${totalCount}).`,
        })
        .onConflictDoNothing({
          target: [
            coordinationSignals.signalType,
            coordinationSignals.signalHash,
            coordinationSignals.windowStart,
          ],
        })
        .returning({ id: coordinationSignals.id });
      if (inserted.length > 0) signalsFound++;
    }
  }

  return signalsFound;
}

/**
 * Label propagation community detection on the interaction graph.
 * Each agent starts with a unique label. At each iteration, each agent
 * adopts the most common label among its neighbors (weighted by interaction strength).
 * Converges when labels stabilize.
 */
export async function detectCommunities(): Promise<{
  communitiesFound: number;
  agentsLabeled: number;
}> {
  const last14d = subDays(new Date(), 14);

  // Get all interactions in the last 14 days
  const allInteractions = await db
    .select({
      sourceAgentId: interactions.sourceAgentId,
      targetAgentId: interactions.targetAgentId,
      weight: interactions.weight,
    })
    .from(interactions)
    .where(gte(interactions.createdAt, last14d));

  // Build undirected weighted adjacency list
  const adjacency = new Map<string, Map<string, number>>();
  const allAgentIds = new Set<string>();

  for (const inter of allInteractions) {
    allAgentIds.add(inter.sourceAgentId);
    allAgentIds.add(inter.targetAgentId);

    // Add edge in both directions (undirected)
    for (const [a, b] of [
      [inter.sourceAgentId, inter.targetAgentId],
      [inter.targetAgentId, inter.sourceAgentId],
    ]) {
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      const current = adjacency.get(a)!.get(b) || 0;
      adjacency.get(a)!.set(b, current + Number(inter.weight));
    }
  }

  if (allAgentIds.size === 0) {
    return { communitiesFound: 0, agentsLabeled: 0 };
  }

  // Initialize: each agent gets a unique label (0, 1, 2, ...)
  const agentArray = Array.from(allAgentIds);
  const labels = new Map<string, number>();
  agentArray.forEach((id, i) => labels.set(id, i));

  // Run label propagation (max 20 iterations)
  const MAX_ITERATIONS = 20;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    // Shuffle order each iteration to avoid bias
    const shuffled = [...agentArray].sort(() => Math.random() - 0.5);

    for (const agentId of shuffled) {
      const neighbors = adjacency.get(agentId);
      if (!neighbors || neighbors.size === 0) continue;

      // Count weighted votes for each label
      const labelVotes = new Map<number, number>();
      for (const [neighborId, weight] of neighbors) {
        const neighborLabel = labels.get(neighborId)!;
        labelVotes.set(
          neighborLabel,
          (labelVotes.get(neighborLabel) || 0) + weight
        );
      }

      // Adopt the label with the most weighted votes
      let bestLabel = labels.get(agentId)!;
      let bestVotes = 0;
      for (const [label, votes] of labelVotes) {
        if (votes > bestVotes) {
          bestVotes = votes;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(agentId)) {
        labels.set(agentId, bestLabel);
        changed = true;
      }
    }

    if (!changed) break; // Converged
  }

  // Normalize labels to sequential numbers
  const uniqueLabels = [...new Set(labels.values())];
  const labelMap = new Map<number, number>();
  uniqueLabels.forEach((label, i) => labelMap.set(label, i));

  // Update agents with community labels
  let agentsLabeled = 0;
  for (const [agentId, label] of labels) {
    const normalizedLabel = labelMap.get(label)!;
    await db
      .update(agents)
      .set({ communityLabel: normalizedLabel })
      .where(eq(agents.id, agentId));
    agentsLabeled++;
  }

  return {
    communitiesFound: uniqueLabels.length,
    agentsLabeled,
  };
}
