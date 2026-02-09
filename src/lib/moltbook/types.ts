// ============================================================
// MOLTBOOK API RESPONSE TYPES
// Based on https://www.moltbook.com/skill.md v1.9.0
// ============================================================

export interface MoltbookAgent {
  name: string;
  description?: string;
  karma?: number;
  follower_count?: number;
  following_count?: number;
  is_claimed?: boolean;
  is_active?: boolean;
  created_at?: string;
  last_active?: string;
  owner?: {
    x_handle?: string;
    x_name?: string;
    x_avatar?: string;
    x_bio?: string;
    x_follower_count?: number;
    x_following_count?: number;
    x_verified?: boolean;
  };
}

export interface MoltbookSubmolt {
  name: string;
  display_name?: string;
  description?: string;
  subscriber_count?: number;
  post_count?: number;
  your_role?: "owner" | "moderator" | null;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content?: string;
  url?: string;
  upvotes: number;
  downvotes: number;
  comment_count?: number;
  created_at: string;
  author: {
    name: string;
    description?: string;
    karma?: number;
  };
  submolt?: {
    name: string;
    display_name?: string;
  };
  is_pinned?: boolean;
}

export interface MoltbookComment {
  id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  author: {
    name: string;
    description?: string;
    karma?: number;
  };
  parent_id?: string;
  post_id?: string;
}

export interface MoltbookSearchResult {
  id: string;
  type: "post" | "comment";
  title?: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  similarity: number;
  author: { name: string };
  submolt?: { name: string; display_name?: string };
  post?: { id: string; title: string };
  post_id: string;
}

export interface MoltbookApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}

export interface MoltbookPostsResponse {
  success: boolean;
  posts?: MoltbookPost[];
  data?: MoltbookPost[];
}

export interface MoltbookCommentsResponse {
  success: boolean;
  comments?: MoltbookComment[];
  data?: MoltbookComment[];
}

export interface MoltbookSearchResponse {
  success: boolean;
  query: string;
  type: string;
  results: MoltbookSearchResult[];
  count: number;
}

export interface MoltbookSubmoltsResponse {
  success: boolean;
  submolts?: MoltbookSubmolt[];
  data?: MoltbookSubmolt[];
}
