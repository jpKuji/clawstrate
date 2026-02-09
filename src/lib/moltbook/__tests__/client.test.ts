import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMoltbookClient } from "@/lib/moltbook/client";
import type { MoltbookClient } from "@/lib/moltbook/client";
import {
  mockPost,
  mockPostMinimal,
  mockComment,
  mockReply,
  mockSubmolt,
  mockAgent,
} from "@/__tests__/mocks/fixtures";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

describe("MoltbookClient", () => {
  let client: MoltbookClient;

  beforeEach(() => {
    mockFetch.mockReset();
    // Reset the singleton so each test suite gets a fresh client
    vi.resetModules();
    process.env.MOLTBOOK_API_KEY = "moltbook_test_key";
    client = getMoltbookClient();
  });

  // ---- Request handling ----

  describe("request handling", () => {
    it("sends Authorization header with Bearer token", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ posts: [] }));
      await client.getPosts();
      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers.Authorization).toBe("Bearer moltbook_test_key");
    });

    it("sends Content-Type application/json header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ posts: [] }));
      await client.getPosts();
      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("constructs correct URLs with API_BASE prefix", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ posts: [] }));
      await client.getPosts();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/www\.moltbook\.com\/api\/v1\/posts\?/);
    });

    it("throws error on non-OK response with status and body", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found" }, 404)
      );
      await expect(client.getPosts()).rejects.toThrow("Moltbook API 404");
    });

    it("throws RATE_LIMITED error on 429 with retry_after info", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ retry_after_minutes: 5 }, 429)
      );
      await expect(client.getPosts()).rejects.toThrow("RATE_LIMITED");
    });
  });

  // ---- getPosts ----

  describe("getPosts", () => {
    it("fetches posts with sort and limit params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ posts: [mockPost] })
      );
      await client.getPosts("hot", 10);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("sort=hot");
      expect(url).toContain("limit=10");
    });

    it("returns posts from response.posts field", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ posts: [mockPost, mockPostMinimal] })
      );
      const posts = await client.getPosts();
      expect(posts).toHaveLength(2);
      expect(posts[0].id).toBe("post-001");
    });

    it("returns posts from response.data field (fallback)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [mockPost] })
      );
      const posts = await client.getPosts();
      expect(posts).toHaveLength(1);
      expect(posts[0].id).toBe("post-001");
    });

    it("returns empty array when response has no posts/data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      const posts = await client.getPosts();
      expect(posts).toEqual([]);
    });

    it("handles optional submolt parameter in URL", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ posts: [mockPost] })
      );
      await client.getPosts("new", 25, "mcp-discussion");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("submolt=mcp-discussion");
    });

    it("uses default sort='new' and limit=25", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ posts: [] }));
      await client.getPosts();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("sort=new");
      expect(url).toContain("limit=25");
    });
  });

  // ---- getPost ----

  describe("getPost", () => {
    it("fetches single post by ID", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ post: mockPost }));
      const post = await client.getPost("post-001");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/posts/post-001");
      expect(post.id).toBe("post-001");
    });

    it("returns post from response.post or response.data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: mockPost }));
      const post = await client.getPost("post-001");
      expect(post.id).toBe("post-001");
    });
  });

  // ---- getComments ----

  describe("getComments", () => {
    it("fetches comments for a post ID with sort and limit params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ comments: [mockComment] })
      );
      await client.getComments("post-001", "new", 10);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/posts/post-001/comments");
      expect(url).toContain("sort=new");
      expect(url).toContain("limit=10");
    });

    it("returns comments from response.comments field", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ comments: [mockComment, mockReply] })
      );
      const comments = await client.getComments("post-001");
      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe("comment-001");
    });

    it("returns comments from response.data field (fallback)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [mockComment] })
      );
      const comments = await client.getComments("post-001");
      expect(comments).toHaveLength(1);
    });

    it("uses default sort='top' and limit=25", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ comments: [] }));
      await client.getComments("post-001");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("sort=top");
      expect(url).toContain("limit=25");
    });
  });

  // ---- getSubmolts ----

  describe("getSubmolts", () => {
    it("fetches all submolts", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ submolts: [mockSubmolt] })
      );
      const submolts = await client.getSubmolts();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/submolts");
      expect(submolts).toHaveLength(1);
    });

    it("returns from response.submolts or response.data", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [mockSubmolt] })
      );
      const submolts = await client.getSubmolts();
      expect(submolts[0].name).toBe("mcp-discussion");
    });
  });

  // ---- getSubmolt ----

  describe("getSubmolt", () => {
    it("fetches single submolt by name", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ submolt: mockSubmolt })
      );
      const submolt = await client.getSubmolt("mcp-discussion");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/submolts/mcp-discussion");
      expect(submolt.name).toBe("mcp-discussion");
    });
  });

  // ---- getSubmoltFeed ----

  describe("getSubmoltFeed", () => {
    it("fetches feed for a specific submolt with sort and limit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ posts: [mockPost] })
      );
      const posts = await client.getSubmoltFeed("mcp-discussion", "hot", 10);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/submolts/mcp-discussion/feed");
      expect(url).toContain("sort=hot");
      expect(url).toContain("limit=10");
      expect(posts).toHaveLength(1);
    });
  });

  // ---- getAgentProfile ----

  describe("getAgentProfile", () => {
    it("fetches agent profile by name (URL-encoded)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ agent: mockAgent, recentPosts: [mockPost] })
      );
      const result = await client.getAgentProfile("Security Bot");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/agents/profile?name=Security%20Bot");
      expect(result.agent.name).toBe("SecurityBot");
    });

    it("returns { agent, recentPosts } object", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ agent: mockAgent, recentPosts: [mockPost] })
      );
      const result = await client.getAgentProfile("SecurityBot");
      expect(result.agent).toEqual(mockAgent);
      expect(result.recentPosts).toHaveLength(1);
    });

    it("handles missing recentPosts (returns empty array)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ agent: mockAgent })
      );
      const result = await client.getAgentProfile("SecurityBot");
      expect(result.recentPosts).toEqual([]);
    });
  });

  // ---- search ----

  describe("search", () => {
    it("sends query, type, and limit as URL params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ results: [] })
      );
      await client.search("MCP security", "posts", 10);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("q=MCP+security");
      expect(url).toContain("type=posts");
      expect(url).toContain("limit=10");
    });

    it("returns results array from response.results", async () => {
      const mockResult = {
        id: "r1",
        type: "post",
        title: "Test",
        content: "test content",
        upvotes: 5,
        downvotes: 0,
        created_at: "2025-01-15T10:00:00Z",
        similarity: 0.95,
        author: { name: "TestBot" },
        post_id: "post-001",
      };
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ results: [mockResult] })
      );
      const results = await client.search("test");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("r1");
    });

    it("returns empty array when no results", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      const results = await client.search("nonexistent");
      expect(results).toEqual([]);
    });
  });

  // ---- getFeed ----

  describe("getFeed", () => {
    it("fetches feed with sort and limit params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ posts: [mockPost] })
      );
      const posts = await client.getFeed("top", 5);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/feed");
      expect(url).toContain("sort=top");
      expect(url).toContain("limit=5");
      expect(posts).toHaveLength(1);
    });
  });

  // ---- Singleton pattern ----

  describe("singleton pattern", () => {
    it("getMoltbookClient throws when MOLTBOOK_API_KEY not set", async () => {
      // Need to reimport to reset the singleton
      vi.resetModules();
      delete process.env.MOLTBOOK_API_KEY;
      const { getMoltbookClient: freshGetClient } = await import(
        "@/lib/moltbook/client"
      );
      expect(() => freshGetClient()).toThrow("MOLTBOOK_API_KEY not set");
    });

    it("getMoltbookClient returns same instance on repeated calls", async () => {
      vi.resetModules();
      process.env.MOLTBOOK_API_KEY = "moltbook_test_key";
      const { getMoltbookClient: freshGetClient } = await import(
        "@/lib/moltbook/client"
      );
      const a = freshGetClient();
      const b = freshGetClient();
      expect(a).toBe(b);
    });
  });
});
