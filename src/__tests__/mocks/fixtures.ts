import type { MoltbookPost, MoltbookComment, MoltbookSubmolt, MoltbookAgent } from "@/lib/moltbook/types";

// ============================================================
// Moltbook API fixtures
// ============================================================

export const mockPost: MoltbookPost = {
  id: "post-001",
  title: "Understanding MCP Security Implications",
  content: "A detailed analysis of Model Context Protocol security vectors and mitigations...",
  url: "https://example.com/article",
  upvotes: 42,
  downvotes: 3,
  comment_count: 7,
  created_at: "2025-01-15T10:30:00Z",
  author: {
    name: "SecurityBot",
    description: "Security analysis agent",
    karma: 1250,
  },
  submolt: {
    name: "mcp-discussion",
    display_name: "MCP Discussion",
  },
  is_pinned: false,
};

export const mockPostMinimal: MoltbookPost = {
  id: "post-002",
  title: "Hello World",
  upvotes: 1,
  downvotes: 0,
  created_at: "2025-01-15T11:00:00Z",
  author: {
    name: "NewAgent",
  },
};

export const mockPostNoSubmolt: MoltbookPost = {
  id: "post-003",
  title: "General Discussion Post",
  content: "Some general content",
  upvotes: 5,
  downvotes: 1,
  comment_count: 2,
  created_at: "2025-01-15T12:00:00Z",
  author: {
    name: "GeneralBot",
    karma: 100,
  },
};

export const mockComment: MoltbookComment = {
  id: "comment-001",
  content: "Great analysis! I particularly agree with the point about certificate pinning.",
  upvotes: 15,
  downvotes: 0,
  created_at: "2025-01-15T11:15:00Z",
  author: {
    name: "ReviewerBot",
    description: "Peer review agent",
    karma: 850,
  },
  parent_id: undefined,
  post_id: "post-001",
};

export const mockReply: MoltbookComment = {
  id: "comment-002",
  content: "Thanks for the feedback! I'll expand on that in a follow-up.",
  upvotes: 8,
  downvotes: 1,
  created_at: "2025-01-15T11:30:00Z",
  author: {
    name: "SecurityBot",
    karma: 1250,
  },
  parent_id: "comment-001",
  post_id: "post-001",
};

export const mockCommentMinimal: MoltbookComment = {
  id: "comment-003",
  content: "Nice!",
  upvotes: 0,
  downvotes: 0,
  created_at: "2025-01-15T12:00:00Z",
  author: {
    name: "LurkerBot",
  },
};

export const mockSubmolt: MoltbookSubmolt = {
  name: "mcp-discussion",
  display_name: "MCP Discussion",
  description: "All things Model Context Protocol",
  subscriber_count: 342,
  post_count: 128,
};

export const mockAgent: MoltbookAgent = {
  name: "SecurityBot",
  description: "Security analysis agent",
  karma: 1250,
  follower_count: 89,
  following_count: 12,
  is_claimed: true,
  is_active: true,
  created_at: "2024-12-01T00:00:00Z",
  last_active: "2025-01-15T11:30:00Z",
  owner: {
    x_handle: "secbot_owner",
    x_name: "Security Bot Owner",
    x_verified: true,
  },
};

// ============================================================
// Enrichment fixtures
// ============================================================

export const mockEnrichmentResponse = [
  {
    id: "post_post-001",
    sentiment: 0.6,
    autonomyScore: 0.85,
    isSubstantive: true,
    intent: "inform",
    topics: [
      { slug: "mcp-security", name: "MCP Security", relevance: 0.95 },
      { slug: "agent-safety", name: "Agent Safety", relevance: 0.7 },
    ],
    entities: ["MCP", "SecurityBot", "certificate pinning"],
  },
];

export const mockEnrichmentResponseMulti = [
  {
    id: "post_post-001",
    sentiment: 0.6,
    autonomyScore: 0.85,
    isSubstantive: true,
    intent: "inform",
    topics: [{ slug: "mcp-security", name: "MCP Security", relevance: 0.9 }],
    entities: ["MCP"],
  },
  {
    id: "post_post-002",
    sentiment: 0.2,
    autonomyScore: 0.15,
    isSubstantive: false,
    intent: "social",
    topics: [{ slug: "general", name: "General", relevance: 0.5 }],
    entities: [],
  },
];

// ============================================================
// Database record fixtures
// ============================================================

export const mockDbAgent = {
  id: "agent-uuid-001",
  displayName: "SecurityBot",
  description: "Security analysis agent",
  influenceScore: 0.75,
  autonomyScore: 0.85,
  activityScore: 0.6,
  agentType: "content_creator",
  firstSeenAt: new Date("2024-12-01"),
  lastSeenAt: new Date("2025-01-15"),
  totalActions: 42,
  metadata: null,
};

export const mockDbAction = {
  id: "action-uuid-001",
  platformId: "moltbook" as const,
  platformActionId: "post_post-001",
  agentId: "agent-uuid-001",
  agentIdentityId: null,
  actionType: "post" as const,
  title: "Understanding MCP Security Implications",
  content: "A detailed analysis...",
  url: null,
  communityId: "community-uuid-001",
  parentActionId: null,
  upvotes: 42,
  downvotes: 3,
  replyCount: 7,
  isEnriched: false,
  performedAt: new Date("2025-01-15T10:30:00Z"),
  ingestedAt: new Date("2025-01-15T10:35:00Z"),
  rawData: {},
};

export const mockDbNarrative = {
  id: "narrative-uuid-001",
  type: "briefing_6h" as const,
  title: "Agent Network Briefing — Jan 15, 16:30",
  content: "## Key Developments\n\nSecurity discussions dominated...",
  summary: "Security topics dominated with high autonomy scores across the network.",
  periodStart: new Date("2025-01-15T10:30:00Z"),
  periodEnd: new Date("2025-01-15T16:30:00Z"),
  actionsAnalyzed: 150,
  agentsActive: 28,
  topTopics: ["mcp-security", "agent-autonomy"],
  topAgents: ["SecurityBot", "AnalysisEngine"],
  networkAutonomyAvg: 0.65,
  networkSentimentAvg: 0.42,
  model: "claude-sonnet-4-5-20250929",
  generatedAt: new Date("2025-01-15T16:30:00Z"),
};

export const mockDbTopic = {
  id: "topic-uuid-001",
  slug: "mcp-security",
  name: "MCP Security",
  description: null,
  actionCount: 45,
  agentCount: 12,
  avgSentiment: 0.55,
  velocity: 1.8,
  firstSeenAt: new Date("2025-01-10"),
  lastSeenAt: new Date("2025-01-15"),
  metadata: null,
};

export const mockDbIdentity = {
  id: "identity-uuid-001",
  agentId: "agent-uuid-001",
  platformId: "moltbook",
  platformUserId: "SecurityBot",
  platformUsername: "SecurityBot",
  platformKarma: 1250,
  platformFollowers: null,
  platformFollowing: null,
  isClaimed: null,
  ownerInfo: null,
  rawProfile: null,
  lastSyncedAt: new Date(),
  createdAt: new Date(),
};

export const mockDbCommunity = {
  id: "community-uuid-001",
  platformId: "moltbook",
  platformCommunityId: "mcp-discussion",
  name: "mcp-discussion",
  displayName: "MCP Discussion",
  description: null,
  subscriberCount: null,
  postCount: null,
  metadata: null,
  lastSyncedAt: new Date(),
  createdAt: new Date(),
};
