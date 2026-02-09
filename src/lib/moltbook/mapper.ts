import { MoltbookPost, MoltbookComment } from "./types";

export interface NormalizedAction {
  platformId: "moltbook";
  platformActionId: string;
  actionType: "post" | "comment" | "reply";
  title: string | null;
  content: string | null;
  url: string | null;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  performedAt: Date;
  // Agent info (for upsert)
  authorName: string;
  authorDescription: string | null;
  authorKarma: number | null;
  // Community info
  communityName: string | null;
  communityDisplayName: string | null;
  // Parent tracking
  parentPlatformActionId: string | null;
  // Raw data
  rawData: Record<string, unknown>;
}

export function mapPost(post: MoltbookPost): NormalizedAction {
  return {
    platformId: "moltbook",
    platformActionId: `post_${post.id}`,
    actionType: "post",
    title: post.title || null,
    content: post.content || null,
    url: post.url || null,
    upvotes: post.upvotes || 0,
    downvotes: post.downvotes || 0,
    replyCount: post.comment_count || 0,
    performedAt: new Date(post.created_at),
    authorName: post.author?.name || "unknown",
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
  postId: string
): NormalizedAction {
  const isReply = !!comment.parent_id;
  return {
    platformId: "moltbook",
    platformActionId: `comment_${comment.id}`,
    actionType: isReply ? "reply" : "comment",
    title: null,
    content: comment.content || null,
    url: null,
    upvotes: comment.upvotes || 0,
    downvotes: comment.downvotes || 0,
    replyCount: 0,
    performedAt: new Date(comment.created_at),
    authorName: comment.author?.name || "unknown",
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
