import { MoltbookPost, MoltbookComment } from "./types";
import { NormalizedAction } from "../sources/types";

interface MapperOptions {
  sourceAdapterId?: string;
  platformId?: string;
}

export function mapPost(
  post: MoltbookPost,
  options: MapperOptions = {}
): NormalizedAction {
  const sourceAdapterId = options.sourceAdapterId ?? "moltbook";
  const platformId = options.platformId ?? "moltbook";
  const authorName = post.author?.name || "unknown";
  return {
    sourceAdapterId,
    platformId,
    platformActionId: `post_${post.id}`,
    actionType: "post",
    title: post.title || null,
    content: post.content || null,
    url: post.url || null,
    upvotes: post.upvotes || 0,
    downvotes: post.downvotes || 0,
    replyCount: post.comment_count || 0,
    performedAt: new Date(post.created_at),
    authorPlatformUserId: authorName,
    authorDisplayName: authorName,
    authorDescription: post.author?.description || null,
    authorKarma: post.author?.karma ?? null,
    communityName: post.submolt?.name || null,
    communityDisplayName: post.submolt?.display_name || null,
    parentPlatformActionId: null,
    rawData: post as unknown as Record<string, unknown>,
  };
}

export function mapComment(
  comment: MoltbookComment,
  postId: string,
  options: MapperOptions = {}
): NormalizedAction {
  const isReply = !!comment.parent_id;
  const sourceAdapterId = options.sourceAdapterId ?? "moltbook";
  const platformId = options.platformId ?? "moltbook";
  const authorName = comment.author?.name || "unknown";
  return {
    sourceAdapterId,
    platformId,
    platformActionId: `comment_${comment.id}`,
    actionType: isReply ? "reply" : "comment",
    title: null,
    content: comment.content || null,
    url: null,
    upvotes: comment.upvotes || 0,
    downvotes: comment.downvotes || 0,
    replyCount: 0,
    performedAt: new Date(comment.created_at),
    authorPlatformUserId: authorName,
    authorDisplayName: authorName,
    authorDescription: comment.author?.description || null,
    authorKarma: comment.author?.karma ?? null,
    communityName: null, // Comments inherit from their post
    communityDisplayName: null,
    parentPlatformActionId: comment.parent_id
      ? `comment_${comment.parent_id}`
      : `post_${postId}`,
    rawData: comment as unknown as Record<string, unknown>,
  };
}
