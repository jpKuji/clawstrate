import {
  MoltbookPost,
  MoltbookComment,
  MoltbookSubmolt,
  MoltbookAgent,
  MoltbookSearchResult,
} from "./types";

const API_BASE = "https://www.moltbook.com/api/v1";

class MoltbookClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = body.retry_after_minutes || body.retry_after_seconds || 60;
      throw new Error(
        `RATE_LIMITED: ${retryAfter}s — ${JSON.stringify(body)}`
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Moltbook API ${res.status}: ${body}`);
    }

    return res.json();
  }

  // ---- Posts ----

  async getPosts(
    sort: "hot" | "new" | "top" | "rising" = "new",
    limit: number = 25,
    submolt?: string
  ): Promise<MoltbookPost[]> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (submolt) params.set("submolt", submolt);
    const data = await this.request<any>(`/posts?${params}`);
    // API returns posts in either .posts or .data or at root level
    return data.posts || data.data || (Array.isArray(data) ? data : []);
  }

  async getPost(postId: string): Promise<MoltbookPost> {
    const data = await this.request<any>(`/posts/${postId}`);
    return data.post || data.data || data;
  }

  // ---- Comments ----

  async getComments(
    postId: string,
    sort: "top" | "new" | "controversial" = "top",
    limit: number = 25
  ): Promise<MoltbookComment[]> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    const data = await this.request<any>(
      `/posts/${postId}/comments?${params}`
    );
    return data.comments || data.data || (Array.isArray(data) ? data : []);
  }

  // ---- Submolts ----

  async getSubmolts(): Promise<MoltbookSubmolt[]> {
    const data = await this.request<any>("/submolts");
    return data.submolts || data.data || (Array.isArray(data) ? data : []);
  }

  async getSubmolt(name: string): Promise<MoltbookSubmolt> {
    const data = await this.request<any>(`/submolts/${name}`);
    return data.submolt || data.data || data;
  }

  async getSubmoltFeed(
    name: string,
    sort: "hot" | "new" | "top" = "new",
    limit: number = 25
  ): Promise<MoltbookPost[]> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    const data = await this.request<any>(
      `/submolts/${name}/feed?${params}`
    );
    return data.posts || data.data || (Array.isArray(data) ? data : []);
  }

  // ---- Agents ----

  async getAgentProfile(name: string): Promise<{
    agent: MoltbookAgent;
    recentPosts: MoltbookPost[];
  }> {
    const data = await this.request<any>(
      `/agents/profile?name=${encodeURIComponent(name)}`
    );
    return {
      agent: data.agent || data,
      recentPosts: data.recentPosts || [],
    };
  }

  // ---- Search ----

  async search(
    query: string,
    type: "posts" | "comments" | "all" = "all",
    limit: number = 20
  ): Promise<MoltbookSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: String(limit),
    });
    const data = await this.request<any>(`/search?${params}`);
    return data.results || [];
  }

  // ---- Feed ----

  async getFeed(
    sort: "hot" | "new" | "top" = "new",
    limit: number = 25
  ): Promise<MoltbookPost[]> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    const data = await this.request<any>(`/feed?${params}`);
    return data.posts || data.data || (Array.isArray(data) ? data : []);
  }
}

// Singleton
let client: MoltbookClient | null = null;

export function getMoltbookClient(): MoltbookClient {
  if (!client) {
    const key = process.env.MOLTBOOK_API_KEY;
    if (!key) throw new Error("MOLTBOOK_API_KEY not set");
    client = new MoltbookClient(key);
  }
  return client;
}

export type { MoltbookClient };
