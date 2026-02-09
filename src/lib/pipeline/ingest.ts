import { db } from "../db";
import {
  agents,
  agentIdentities,
  communities,
  actions,
  interactions,
  syncLog,
} from "../db/schema";
import { getMoltbookClient } from "../moltbook/client";
import { mapPost, mapComment, NormalizedAction } from "../moltbook/mapper";
import { eq, and } from "drizzle-orm";

/**
 * Main ingestion function. Call every 30 minutes.
 */
export async function runIngestion(): Promise<{
  postsIngested: number;
  commentsIngested: number;
  errors: string[];
}> {
  const client = getMoltbookClient();
  const errors: string[] = [];
  let postsIngested = 0;
  let commentsIngested = 0;

  // Log sync start
  const [syncEntry] = await db
    .insert(syncLog)
    .values({
      platformId: "moltbook",
      syncType: "full_cycle",
      status: "started",
    })
    .returning();

  try {
    // 1. Fetch posts from multiple sort orders
    const [newPosts, hotPosts] = await Promise.all([
      client.getPosts("new", 25).catch((e) => {
        errors.push(`new posts: ${e.message}`);
        return [];
      }),
      client.getPosts("hot", 25).catch((e) => {
        errors.push(`hot posts: ${e.message}`);
        return [];
      }),
    ]);

    // Deduplicate by post ID
    const allPosts = new Map<string, typeof newPosts[0]>();
    for (const p of [...newPosts, ...hotPosts]) {
      if (p?.id) allPosts.set(p.id, p);
    }

    console.log(
      `[ingest] Fetched ${allPosts.size} unique posts (${newPosts.length} new, ${hotPosts.length} hot)`
    );

    // 2. Map and ingest each post
    const normalizedActions: NormalizedAction[] = [];

    for (const post of allPosts.values()) {
      normalizedActions.push(mapPost(post));
    }

    // 3. Fetch comments for posts we haven't seen before (or all, to catch new comments)
    // To stay within rate limits, only fetch comments for the newest 10 posts
    const postsForComments = [...allPosts.values()]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 10);

    for (const post of postsForComments) {
      try {
        const comments = await client.getComments(post.id, "top", 25);
        for (const comment of comments) {
          normalizedActions.push(mapComment(comment, post.id));
        }
      } catch (e: any) {
        errors.push(`comments for ${post.id}: ${e.message}`);
      }
    }

    console.log(
      `[ingest] Total normalized actions: ${normalizedActions.length}`
    );

    // 4. Upsert all actions
    for (const action of normalizedActions) {
      try {
        const result = await upsertAction(action);
        if (result.isNew) {
          if (action.actionType === "post") postsIngested++;
          else commentsIngested++;
        }
      } catch (e: any) {
        errors.push(`upsert ${action.platformActionId}: ${e.message}`);
      }
    }

    // Update sync log
    await db
      .update(syncLog)
      .set({
        status: errors.length > 0 ? "completed_with_errors" : "completed",
        itemsFetched: normalizedActions.length,
        itemsIngested: postsIngested + commentsIngested,
        error: errors.length > 0 ? errors.join("; ") : null,
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
    throw e;
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
      rawData: action.rawData,
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
      totalActions: (await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      }))!.totalActions! + 1,
    })
    .where(eq(agents.id, agentId));

  return { isNew: true };
}

async function upsertAgent(action: NormalizedAction): Promise<string> {
  // Check if we have this identity
  const existingIdentity = await db.query.agentIdentities.findFirst({
    where: and(
      eq(agentIdentities.platformId, action.platformId),
      eq(agentIdentities.platformUserId, action.authorName)
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
    return existingIdentity.agentId;
  }

  // Create new agent + identity
  const [newAgent] = await db
    .insert(agents)
    .values({
      displayName: action.authorName,
      description: action.authorDescription,
      firstSeenAt: action.performedAt,
      lastSeenAt: action.performedAt,
      totalActions: 0,
    })
    .returning();

  await db.insert(agentIdentities).values({
    agentId: newAgent.id,
    platformId: action.platformId,
    platformUserId: action.authorName,
    platformUsername: action.authorName,
    platformKarma: action.authorKarma,
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
