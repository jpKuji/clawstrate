import { db } from "../db";
import {
  agents,
  agentIdentities,
  communities,
  actions,
  interactions,
  syncLog,
} from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getEnabledSourceAdapters } from "../sources";
import { NormalizedAction } from "../sources/types";
import {
  classifyRentAHumanActor,
  formatAgentDisplayLabel,
  mergeActorKindIntoRawProfile,
} from "../agents/classify";

/**
 * Main ingestion function. Call every 30 minutes.
 */
export async function runIngestion(): Promise<{
  postsIngested: number;
  commentsIngested: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let postsIngested = 0;
  let commentsIngested = 0;
  const adapters = getEnabledSourceAdapters();
  if (adapters.length === 0) {
    return {
      postsIngested: 0,
      commentsIngested: 0,
      errors: ["No enabled source adapters found"],
    };
  }

  for (const adapter of adapters) {
    const [syncEntry] = await db
      .insert(syncLog)
      .values({
        platformId: adapter.platformId,
        syncType: `full_cycle:${adapter.id}`,
        status: "started",
      })
      .returning();

    try {
      const ingestResult = await adapter.ingest();
      const adapterErrors = ingestResult.errors.map(
        (e) => `[${adapter.id}] ${e}`
      );
      errors.push(...adapterErrors);
      let adapterPostsIngested = 0;
      let adapterCommentsIngested = 0;

      console.log(
        `[ingest:${adapter.id}] Fetched ${ingestResult.postsFetched} posts and ${ingestResult.commentsFetched} comments`
      );
      console.log(
        `[ingest:${adapter.id}] Total normalized actions: ${ingestResult.actions.length}`
      );

      // Batch-check which actions already exist (1 query instead of N)
      const platformActionIds = ingestResult.actions.map(
        (a) => a.platformActionId
      );
      const existingActionsList =
        platformActionIds.length > 0
          ? await db.query.actions.findMany({
              where: and(
                eq(actions.platformId, adapter.platformId),
                inArray(actions.platformActionId, platformActionIds)
              ),
            })
          : [];
      const existingActionMap = new Map(
        existingActionsList.map((a) => [a.platformActionId, a])
      );

      for (const action of ingestResult.actions) {
        try {
          const existing = existingActionMap.get(action.platformActionId);
          const result = await upsertAction(action, existing ?? undefined);
          if (result.isNew) {
            if (action.actionType === "post") {
              postsIngested++;
              adapterPostsIngested++;
            } else {
              commentsIngested++;
              adapterCommentsIngested++;
            }
          }
        } catch (e: any) {
          errors.push(
            `[${adapter.id}] upsert ${action.platformActionId}: ${e.message}`
          );
        }
      }

      await db
        .update(syncLog)
        .set({
          status: adapterErrors.length > 0 ? "completed_with_errors" : "completed",
          itemsFetched: ingestResult.actions.length,
          itemsIngested: adapterPostsIngested + adapterCommentsIngested,
          error: adapterErrors.length > 0 ? adapterErrors.join("; ") : null,
          completedAt: new Date(),
        })
        .where(eq(syncLog.id, syncEntry.id));
    } catch (e: any) {
      await db
        .update(syncLog)
        .set({
          status: "failed",
          error: e.message,
          completedAt: new Date(),
        })
        .where(eq(syncLog.id, syncEntry.id));
      errors.push(`[${adapter.id}] fatal: ${e.message}`);
      throw e;
    }
  }

  return { postsIngested, commentsIngested, errors };
}

/**
 * Upsert a single normalized action into the database.
 * Handles agent/community creation and interaction edge creation.
 */
async function upsertAction(
  action: NormalizedAction,
  existingAction?: { id: string }
): Promise<{ isNew: boolean }> {
  if (existingAction) {
    // Fast path: action already exists, just update metrics (skip agent upsert)
    await db
      .update(actions)
      .set({
        upvotes: action.upvotes,
        downvotes: action.downvotes,
        replyCount: action.replyCount,
      })
      .where(eq(actions.id, existingAction.id));
    return { isNew: false };
  }

  // 1. Upsert agent
  const agentId = await upsertAgent(action);

  // 2. Upsert community (if applicable)
  let communityId: string | null = null;
  if (action.communityName) {
    communityId = await upsertCommunity(action);
  }

  // 3. Resolve parent action ID
  let parentActionId: string | null = null;
  if (action.parentPlatformActionId) {
    const parent = await db.query.actions.findFirst({
      where: and(
        eq(actions.platformId, action.platformId),
        eq(actions.platformActionId, action.parentPlatformActionId)
      ),
    });
    parentActionId = parent?.id || null;
  }

  // 4. Insert action
  const [inserted] = await db
    .insert(actions)
    .values({
      platformId: action.platformId,
      platformActionId: action.platformActionId,
      agentId,
      actionType: action.actionType,
      title: action.title,
      content: action.content,
      url: action.url,
      communityId,
      parentActionId,
      upvotes: action.upvotes,
      downvotes: action.downvotes,
      replyCount: action.replyCount,
      performedAt: action.performedAt,
      rawData: {
        sourceAdapterId: action.sourceAdapterId,
        ...action.rawData,
      },
    })
    .returning();

  // 5. Create interaction edge (if this is a reply/comment with a parent)
  if (parentActionId && agentId) {
    const parentAction = await db.query.actions.findFirst({
      where: eq(actions.id, parentActionId),
    });

    if (parentAction?.agentId && parentAction.agentId !== agentId) {
      await db
        .insert(interactions)
        .values({
          sourceAgentId: agentId,
          targetAgentId: parentAction.agentId,
          actionId: inserted.id,
          interactionType: action.actionType, // "comment" or "reply"
          weight: action.actionType === "reply" ? 3.0 : 2.0,
        })
        .onConflictDoNothing();
    }
  }

  // 6. Update agent activity
  await db
    .update(agents)
    .set({
      lastSeenAt: action.performedAt,
      totalActions: sql`${agents.totalActions} + 1`,
    })
    .where(eq(agents.id, agentId));

  return { isNew: true };
}

async function upsertAgent(action: NormalizedAction): Promise<string> {
  const displayLabel = formatAgentDisplayLabel({
    displayName: action.authorDisplayName,
    platformId: action.platformId,
    platformUserId: action.authorPlatformUserId,
  });

  // Check if we have this identity
  const existingIdentity = await db.query.agentIdentities.findFirst({
    where: and(
      eq(agentIdentities.platformId, action.platformId),
      eq(agentIdentities.platformUserId, action.authorPlatformUserId)
    ),
  });

  if (existingIdentity) {
    const rawProfilePatch = await buildRawProfilePatch(action, existingIdentity.agentId);
    const platformUsername =
      action.platformId === "rentahuman"
        ? displayLabel
        : action.authorDisplayName;
    const identityPatch: Record<string, unknown> = {
      lastSyncedAt: new Date(),
      platformUsername,
    };

    if (action.authorKarma !== null) {
      identityPatch.platformKarma = action.authorKarma;
    }

    if (rawProfilePatch) {
      identityPatch.rawProfile = sql`COALESCE(${agentIdentities.rawProfile}, '{}'::jsonb) || ${JSON.stringify(rawProfilePatch)}::jsonb`;
    }

    await db
      .update(agentIdentities)
      .set(identityPatch as any)
      .where(eq(agentIdentities.id, existingIdentity.id));

    const agentPatch: Record<string, unknown> = {
      displayName: displayLabel,
    };
    if (action.authorDescription) {
      agentPatch.description = action.authorDescription;
    }

    await db
      .update(agents)
      .set(agentPatch as any)
      .where(eq(agents.id, existingIdentity.agentId));

    return existingIdentity.agentId;
  }

  const rawProfilePatch = await buildRawProfilePatch(action);

  // Create new agent + identity
  const [newAgent] = await db
    .insert(agents)
    .values({
      displayName: displayLabel,
      description: action.authorDescription,
      firstSeenAt: action.performedAt,
      lastSeenAt: action.performedAt,
      totalActions: 0,
    })
    .returning();

  await db.insert(agentIdentities).values({
    agentId: newAgent.id,
    platformId: action.platformId,
    platformUserId: action.authorPlatformUserId,
    platformUsername:
      action.platformId === "rentahuman"
        ? displayLabel
        : action.authorDisplayName,
    platformKarma: action.authorKarma,
    rawProfile: rawProfilePatch,
  });

  return newAgent.id;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>)) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function rentAHumanActionFlags(action: NormalizedAction): {
  bountyPosts: number;
  assignmentComments: number;
} {
  const rawKind =
    action.rawData && typeof action.rawData.kind === "string"
      ? action.rawData.kind
      : null;

  const isBounty = action.actionType === "post" || rawKind === "bounty";
  const isAssignment = rawKind === "assignment" || action.actionType !== "post";

  return {
    bountyPosts: isBounty ? 1 : 0,
    assignmentComments: isAssignment ? 1 : 0,
  };
}

async function resolveRentAHumanClassification(
  action: NormalizedAction,
  existingAgentId?: string
) {
  const currentFlags = rentAHumanActionFlags(action);

  if (!existingAgentId) {
    return classifyRentAHumanActor(currentFlags);
  }

  const countsResult = await db.execute<{
    bounty_posts: number;
    assignment_comments: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE ${actions.actionType} = 'post'
          AND COALESCE(${actions.rawData}->>'kind', 'bounty') = 'bounty'
      )::int AS bounty_posts,
      COUNT(*) FILTER (
        WHERE COALESCE(${actions.rawData}->>'kind', '') = 'assignment'
      )::int AS assignment_comments
    FROM ${actions}
    WHERE ${actions.agentId} = ${existingAgentId}
      AND ${actions.platformId} = 'rentahuman'
  `);

  const rows = extractRows<{ bounty_posts: number; assignment_comments: number }>(
    countsResult
  );
  const row = rows[0];

  return classifyRentAHumanActor({
    bountyPosts: Number(row?.bounty_posts || 0) + currentFlags.bountyPosts,
    assignmentComments:
      Number(row?.assignment_comments || 0) + currentFlags.assignmentComments,
  });
}

async function buildRawProfilePatch(
  action: NormalizedAction,
  existingAgentId?: string
): Promise<Record<string, unknown> | null> {
  const patch: Record<string, unknown> = {
    ...(action.authorRawProfile || {}),
  };

  if (action.platformId === "rentahuman") {
    const classification = await resolveRentAHumanClassification(
      action,
      existingAgentId
    );
    return mergeActorKindIntoRawProfile(patch, classification);
  }

  if (action.actorKind) {
    patch.actorKind = action.actorKind;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

async function upsertCommunity(action: NormalizedAction): Promise<string> {
  const existing = await db.query.communities.findFirst({
    where: and(
      eq(communities.platformId, action.platformId),
      eq(communities.platformCommunityId, action.communityName!)
    ),
  });

  if (existing) return existing.id;

  const [newCommunity] = await db
    .insert(communities)
    .values({
      platformId: action.platformId,
      platformCommunityId: action.communityName!,
      name: action.communityName!,
      displayName: action.communityDisplayName || action.communityName!,
    })
    .returning();

  return newCommunity.id;
}
