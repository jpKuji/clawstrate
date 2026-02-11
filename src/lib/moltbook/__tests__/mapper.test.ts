import { describe, it, expect } from "vitest";
import { mapPost, mapComment } from "../mapper";
import {
  mockPost,
  mockPostMinimal,
  mockPostNoSubmolt,
  mockComment,
  mockReply,
  mockCommentMinimal,
} from "@/__tests__/mocks/fixtures";
import type { MoltbookPost, MoltbookComment } from "../types";

describe("mapPost", () => {
  it("maps a complete post with all fields", () => {
    const result = mapPost(mockPost);

    expect(result).toEqual({
      sourceAdapterId: "moltbook",
      platformId: "moltbook",
      platformActionId: "post_post-001",
      actionType: "post",
      title: "Understanding MCP Security Implications",
      content:
        "A detailed analysis of Model Context Protocol security vectors and mitigations...",
      url: "https://example.com/article",
      upvotes: 42,
      downvotes: 3,
      replyCount: 7,
      performedAt: new Date("2025-01-15T10:30:00Z"),
      authorName: "SecurityBot",
      authorDescription: "Security analysis agent",
      authorKarma: 1250,
      communityName: "mcp-discussion",
      communityDisplayName: "MCP Discussion",
      parentPlatformActionId: null,
      rawData: mockPost,
    });
  });

  it("maps a minimal post with no optional fields", () => {
    const result = mapPost(mockPostMinimal);

    expect(result.platformActionId).toBe("post_post-002");
    expect(result.content).toBeNull();
    expect(result.url).toBeNull();
    expect(result.communityName).toBeNull();
    expect(result.communityDisplayName).toBeNull();
    expect(result.authorKarma).toBeNull();
    expect(result.authorDescription).toBeNull();
    expect(result.replyCount).toBe(0);
  });

  it("sets platformActionId as post_${id}", () => {
    const result = mapPost(mockPost);
    expect(result.platformActionId).toBe(`post_${mockPost.id}`);
  });

  it("sets actionType to 'post'", () => {
    const result = mapPost(mockPost);
    expect(result.actionType).toBe("post");
  });

  it("sets parentPlatformActionId to null", () => {
    const result = mapPost(mockPost);
    expect(result.parentPlatformActionId).toBeNull();
  });

  it("handles zero upvotes and downvotes", () => {
    const post: MoltbookPost = {
      id: "post-zero",
      title: "Zero votes",
      upvotes: 0,
      downvotes: 0,
      created_at: "2025-01-15T10:00:00Z",
      author: { name: "TestBot" },
    };
    const result = mapPost(post);

    expect(result.upvotes).toBe(0);
    expect(result.downvotes).toBe(0);
  });

  it("handles missing author name by defaulting to 'unknown'", () => {
    const post = {
      id: "post-no-author",
      title: "No author",
      upvotes: 1,
      downvotes: 0,
      created_at: "2025-01-15T10:00:00Z",
      author: {} as { name: string },
    } as MoltbookPost;
    const result = mapPost(post);

    expect(result.authorName).toBe("unknown");
  });

  it("preserves rawData as the original post object", () => {
    const result = mapPost(mockPost);
    expect(result.rawData).toBe(mockPost);
  });

  it("correctly parses created_at into a Date", () => {
    const result = mapPost(mockPost);
    expect(result.performedAt).toBeInstanceOf(Date);
    expect(result.performedAt.toISOString()).toBe("2025-01-15T10:30:00.000Z");
  });

  it("sets communityName from submolt.name and communityDisplayName from submolt.display_name", () => {
    const result = mapPost(mockPost);
    expect(result.communityName).toBe("mcp-discussion");
    expect(result.communityDisplayName).toBe("MCP Discussion");
  });

  it("sets community fields to null when submolt is absent", () => {
    const result = mapPost(mockPostNoSubmolt);
    expect(result.communityName).toBeNull();
    expect(result.communityDisplayName).toBeNull();
  });

  it("sets platformId to 'moltbook'", () => {
    const result = mapPost(mockPost);
    expect(result.platformId).toBe("moltbook");
  });

  it("sets sourceAdapterId to 'moltbook' by default", () => {
    const result = mapPost(mockPost);
    expect(result.sourceAdapterId).toBe("moltbook");
  });

  it("maps author karma via nullish coalescing (preserves 0)", () => {
    const post: MoltbookPost = {
      id: "post-zero-karma",
      title: "Zero karma author",
      upvotes: 1,
      downvotes: 0,
      created_at: "2025-01-15T10:00:00Z",
      author: { name: "ZeroKarmaBot", karma: 0 },
    };
    const result = mapPost(post);
    expect(result.authorKarma).toBe(0);
  });
});

describe("mapComment", () => {
  it("maps a top-level comment with actionType 'comment'", () => {
    const result = mapComment(mockComment, "post-001");

    expect(result.actionType).toBe("comment");
    expect(result.platformActionId).toBe("comment_comment-001");
    expect(result.parentPlatformActionId).toBe("post_post-001");
    expect(result.content).toBe(
      "Great analysis! I particularly agree with the point about certificate pinning."
    );
    expect(result.authorName).toBe("ReviewerBot");
    expect(result.authorDescription).toBe("Peer review agent");
    expect(result.authorKarma).toBe(850);
    expect(result.upvotes).toBe(15);
    expect(result.downvotes).toBe(0);
  });

  it("maps a reply with actionType 'reply'", () => {
    const result = mapComment(mockReply, "post-001");

    expect(result.actionType).toBe("reply");
    expect(result.parentPlatformActionId).toBe("comment_comment-001");
  });

  it("sets parentPlatformActionId to comment_${parent_id} for replies", () => {
    const result = mapComment(mockReply, "post-001");
    expect(result.parentPlatformActionId).toBe(
      `comment_${mockReply.parent_id}`
    );
  });

  it("sets parentPlatformActionId to post_${postId} for top-level comments", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.parentPlatformActionId).toBe("post_post-001");
  });

  it("sets platformActionId as comment_${id}", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.platformActionId).toBe(`comment_${mockComment.id}`);
  });

  it("sets communityName and communityDisplayName to null", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.communityName).toBeNull();
    expect(result.communityDisplayName).toBeNull();
  });

  it("maps a minimal comment with no optional fields", () => {
    const result = mapComment(mockCommentMinimal, "post-001");

    expect(result.platformActionId).toBe("comment_comment-003");
    expect(result.actionType).toBe("comment");
    expect(result.authorName).toBe("LurkerBot");
    expect(result.authorDescription).toBeNull();
    expect(result.authorKarma).toBeNull();
    expect(result.upvotes).toBe(0);
    expect(result.downvotes).toBe(0);
    expect(result.parentPlatformActionId).toBe("post_post-001");
  });

  it("handles missing author.description as null", () => {
    const result = mapComment(mockCommentMinimal, "post-001");
    expect(result.authorDescription).toBeNull();
  });

  it("handles missing author.karma as null", () => {
    const result = mapComment(mockCommentMinimal, "post-001");
    expect(result.authorKarma).toBeNull();
  });

  it("preserves rawData as the original comment object", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.rawData).toBe(mockComment);
  });

  it("correctly parses created_at into a Date", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.performedAt).toBeInstanceOf(Date);
    expect(result.performedAt.toISOString()).toBe("2025-01-15T11:15:00.000Z");
  });

  it("sets title to null for all comments", () => {
    expect(mapComment(mockComment, "post-001").title).toBeNull();
    expect(mapComment(mockReply, "post-001").title).toBeNull();
  });

  it("sets url to null for all comments", () => {
    expect(mapComment(mockComment, "post-001").url).toBeNull();
    expect(mapComment(mockReply, "post-001").url).toBeNull();
  });

  it("sets replyCount to 0 for all comments", () => {
    expect(mapComment(mockComment, "post-001").replyCount).toBe(0);
    expect(mapComment(mockReply, "post-001").replyCount).toBe(0);
  });

  it("sets platformId to 'moltbook'", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.platformId).toBe("moltbook");
  });

  it("sets sourceAdapterId to 'moltbook' by default", () => {
    const result = mapComment(mockComment, "post-001");
    expect(result.sourceAdapterId).toBe("moltbook");
  });
});
