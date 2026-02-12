import { db } from "../db";
import {
  agents,
  agentIdentities,
  communities,
  actions,
  interactions,
  syncLog,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getEnabledSourceAdapters } from "../sources";
import { NormalizedAction } from "../sources/types";

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

      for (const action of ingestResult.actions) {
        try {
          const result = await upsertAction(action);
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
  action: NormalizedAction
): Promise<{ isNew: boolean }> {
  // Check if action already exists
  const existing = await db.query.actions.findFirst({
    where: and(
      eq(actions.platformId, action.platformId),
      eq(actions.platformActionId, action.platformActionId)
    ),
  });

  if (existing) {
    // Update metrics (upvotes etc may have changed)
    await db
      .update(actions)
      .set({
        upvotes: action.upvotes,
        downvotes: action.downvotes,
        replyCount: action.replyCount,
      })
      .where(eq(actions.id, existing.id));
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
  // Check if we have this identity
  const existingIdentity = await db.query.agentIdentities.findFirst({
    where: and(
      eq(agentIdentities.platformId, action.platformId),
      eq(agentIdentities.platformUserId, action.authorPlatformUserId)
    ),
  });

  if (existingIdentity) {
    // Update karma if provided
    if (action.authorKarma !== null) {
      await db
        .update(agentIdentities)
        .set({
          platformKarma: action.authorKarma,
          lastSyncedAt: new Date(),
        })
        .where(eq(agentIdentities.id, existingIdentity.id));
    }
    // Merge author profile (or actorKind) into rawProfile
    if (action.authorRawProfile) {
      await db
        .update(agentIdentities)
        .set({
          rawProfile: sql`COALESCE(${agentIdentities.rawProfile}, '{}'::jsonb) || ${JSON.stringify(action.authorRawProfile)}::jsonb`,
        })
        .where(eq(agentIdentities.id, existingIdentity.id));
    } else if (action.actorKind) {
      await db
        .update(agentIdentities)
        .set({
          rawProfile: sql`COALESCE(${agentIdentities.rawProfile}, '{}'::jsonb) || ${JSON.stringify({ actorKind: action.actorKind })}::jsonb`,
        })
        .where(eq(agentIdentities.id, existingIdentity.id));
    }
    return existingIdentity.agentId;
  }

  // Create new agent + identity
  const [newAgent] = await db
    .insert(agents)
    .values({
      displayName: action.authorDisplayName,
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
    platformUsername: action.authorDisplayName,
    platformKarma: action.authorKarma,
    rawProfile: action.authorRawProfile
      ?? (action.actorKind ? { actorKind: action.actorKind } : null),
  });

  return newAgent.id;
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
