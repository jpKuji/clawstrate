import { getMoltbookClient } from "../moltbook/client";
import { mapPost, mapComment } from "../moltbook/mapper";
import { SourceAdapter, SourceIngestionResult } from "./types";

export const moltbookSourceAdapter: SourceAdapter = {
  id: "moltbook",
  platformId: "moltbook",
  displayName: "Moltbook",
  methodology: {
    id: "moltbook",
    displayName: "Moltbook",
    status: "active",
    coverageSummary:
      "Ingests public forum-style activity (posts and comments/replies) from prioritized feeds and active sub-communities.",
    ingestionBehavior: [
      "Fetches posts from `new`, `hot`, and `rising` feeds (25 each), then de-duplicates by platform post id.",
      "Expands coverage using the top 5 submolts by `post_count`, fetching each submolt's newest 10 posts.",
      "Crawls comments for up to 20 posts ranked by engagement score, filtering on `comment_count > 0`.",
      "Creates interaction edges for non-self replies/comments against resolved parent actions.",
    ],
    identityModel:
      "Separate identity by default. Canonical identities are keyed by `(platform_id, platform_user_id)` with no automatic cross-platform merge.",
    knownLimitations: [
      "Read-focused ingest currently captures post/comment activity only; votes, follows, and private interactions are out of scope.",
      "Coverage is prioritized rather than exhaustive, so low-engagement long-tail discussions may be sampled less frequently.",
      "Community metadata is best-effort from source API responses and may lag platform-side edits.",
    ],
    sourceSpecificMetrics: [
      { label: "Primary post feeds", value: "new, hot, rising (25 each run)" },
      { label: "Sub-community sweep", value: "Top 5 submolts, newest 10 posts each" },
      { label: "Comment crawl budget", value: "Up to 20 posts, 25 comments per post" },
      { label: "Comment inclusion threshold", value: "comment_count > 0" },
    ],
  },
  isEnabled: () => true,
  ingest: ingestMoltbook,
};

async function ingestMoltbook(): Promise<SourceIngestionResult> {
  const client = getMoltbookClient();
  const errors: string[] = [];

  const [newPosts, hotPosts, risingPosts] = await Promise.all([
    client.getPosts("new", 25).catch((e: Error) => {
      errors.push(`new posts: ${e.message}`);
      return [];
    }),
    client.getPosts("hot", 25).catch((e: Error) => {
      errors.push(`hot posts: ${e.message}`);
      return [];
    }),
    client.getPosts("rising", 25).catch((e: Error) => {
      errors.push(`rising posts: ${e.message}`);
      return [];
    }),
  ]);

  const allPosts = new Map<string, (typeof newPosts)[number]>();
  for (const p of [...newPosts, ...hotPosts, ...risingPosts]) {
    if (p?.id) allPosts.set(p.id, p);
  }

  try {
    const submolts = await client.getSubmolts();
    const topSubmolts = submolts
      .sort((a, b) => (b.post_count || 0) - (a.post_count || 0))
      .slice(0, 5);

    for (const submolt of topSubmolts) {
      try {
        const submoltPosts = await client.getSubmoltFeed(submolt.name, "new", 10);
        for (const p of submoltPosts) {
          if (p?.id) allPosts.set(p.id, p);
        }
      } catch (e: any) {
        errors.push(`submolt ${submolt.name}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`submolts list: ${e.message}`);
  }

  const actions = [...allPosts.values()].map((post) =>
    mapPost(post, {
      sourceAdapterId: "moltbook",
      platformId: "moltbook",
    })
  );

  let commentsFetched = 0;
  const postsForComments = [...allPosts.values()]
    .sort((a, b) => {
      const aScore =
        (a.comment_count || 0) * 10 + new Date(a.created_at).getTime() / 1e12;
      const bScore =
        (b.comment_count || 0) * 10 + new Date(b.created_at).getTime() / 1e12;
      return bScore - aScore;
    })
    .filter((p) => (p.comment_count || 0) > 0)
    .slice(0, 20);

  for (const post of postsForComments) {
    try {
      const comments = await client.getComments(post.id, "top", 25);
      commentsFetched += comments.length;
      for (const comment of comments) {
        actions.push(
          mapComment(comment, post.id, {
            sourceAdapterId: "moltbook",
            platformId: "moltbook",
          })
        );
      }
    } catch (e: any) {
      errors.push(`comments for ${post.id}: ${e.message}`);
    }
  }

  return {
    actions,
    postsFetched: allPosts.size,
    commentsFetched,
    errors,
  };
}
