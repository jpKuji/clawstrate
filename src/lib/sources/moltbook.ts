import { getMoltbookClient } from "../moltbook/client";
import { mapPost, mapComment } from "../moltbook/mapper";
import { SourceAdapter, SourceIngestionResult } from "./types";

export const moltbookSourceAdapter: SourceAdapter = {
  id: "moltbook",
  platformId: "moltbook",
  displayName: "Moltbook",
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
