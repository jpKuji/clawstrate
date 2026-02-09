import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// ENUMS
// ============================================================

export const actionTypeEnum = pgEnum("action_type", [
  "post",
  "reply",
  "comment",
  "upvote",
  "downvote",
  "follow",
  "unfollow",
  "create_community",
  "subscribe",
  "unsubscribe",
  "register",
  "update_profile",
  "search",
  "pay",
  "list_service",
  "complete_task",
  "other",
]);

export const platformTypeEnum = pgEnum("platform_type", [
  "social",
  "marketplace",
  "onchain",
  "simulation",
  "other",
]);

export const narrativeTypeEnum = pgEnum("narrative_type", [
  "briefing_6h",
  "briefing_daily",
  "alert",
  "weekly_summary",
]);

// ============================================================
// STRUCTURAL TABLES (Layer 0)
// ============================================================

export const platforms = pgTable("platforms", {
  id: text("id").primaryKey(), // e.g. "moltbook", "moltx", "clawtask"
  name: text("name").notNull(),
  type: platformTypeEnum("type").notNull(),
  apiBase: text("api_base"),
  config: jsonb("config").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Canonical name — for display. May differ across platforms.
    displayName: text("display_name").notNull(),
    description: text("description"),
    // Aggregated scores (recomputed by analyze pipeline)
    influenceScore: real("influence_score").default(0),
    autonomyScore: real("autonomy_score").default(0),
    activityScore: real("activity_score").default(0),
    // Agent classification (set by analyze pipeline)
    agentType: text("agent_type"), // "content_creator", "commenter", "curator", "lurker", "spammer", "bot_farm"
    // Metadata
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    totalActions: integer("total_actions").default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("idx_agents_influence").on(t.influenceScore),
    index("idx_agents_autonomy").on(t.autonomyScore),
    index("idx_agents_last_seen").on(t.lastSeenAt),
  ]
);

export const agentIdentities = pgTable(
  "agent_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    platformId: text("platform_id")
      .references(() => platforms.id)
      .notNull(),
    platformUserId: text("platform_user_id").notNull(), // e.g. Moltbook agent name
    platformUsername: text("platform_username"),
    platformKarma: integer("platform_karma"),
    platformFollowers: integer("platform_followers"),
    platformFollowing: integer("platform_following"),
    isClaimed: boolean("is_claimed"),
    ownerInfo: jsonb("owner_info").$type<Record<string, unknown>>(), // X handle, etc.
    rawProfile: jsonb("raw_profile").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_agent_identity_unique").on(
      t.platformId,
      t.platformUserId
    ),
    index("idx_agent_identity_agent").on(t.agentId),
  ]
);

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platformId: text("platform_id")
      .references(() => platforms.id)
      .notNull(),
    platformCommunityId: text("platform_community_id").notNull(), // e.g. submolt name
    name: text("name").notNull(),
    displayName: text("display_name"),
    description: text("description"),
    subscriberCount: integer("subscriber_count"),
    postCount: integer("post_count"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_community_unique").on(
      t.platformId,
      t.platformCommunityId
    ),
  ]
);

// ============================================================
// ACTION TABLES (Layer 0 — Core Data)
// ============================================================

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Source tracking
    platformId: text("platform_id")
      .references(() => platforms.id)
      .notNull(),
    platformActionId: text("platform_action_id").notNull(), // Original ID from platform
    // Who did it
    agentId: uuid("agent_id").references(() => agents.id),
    agentIdentityId: uuid("agent_identity_id").references(
      () => agentIdentities.id
    ),
    // What they did
    actionType: actionTypeEnum("action_type").notNull(),
    // Content
    title: text("title"),
    content: text("content"),
    url: text("url"),
    // Context
    communityId: uuid("community_id").references(() => communities.id),
    parentActionId: uuid("parent_action_id"), // For replies/comments — references actions.id
    // Platform-specific metrics at time of ingestion
    upvotes: integer("upvotes").default(0),
    downvotes: integer("downvotes").default(0),
    replyCount: integer("reply_count").default(0),
    // Processing state
    isEnriched: boolean("is_enriched").default(false),
    // Timestamps
    performedAt: timestamp("performed_at").notNull(), // When the action happened on the platform
    ingestedAt: timestamp("ingested_at").defaultNow().notNull(),
    // Raw data from platform (for debugging / reprocessing)
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("idx_action_platform_unique").on(
      t.platformId,
      t.platformActionId
    ),
    index("idx_action_agent").on(t.agentId),
    index("idx_action_type").on(t.actionType),
    index("idx_action_performed").on(t.performedAt),
    index("idx_action_community").on(t.communityId),
    index("idx_action_enriched").on(t.isEnriched),
    index("idx_action_parent").on(t.parentActionId),
  ]
);

export const actionSnapshots = pgTable(
  "action_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actionId: uuid("action_id")
      .references(() => actions.id)
      .notNull(),
    upvotes: integer("upvotes").default(0),
    downvotes: integer("downvotes").default(0),
    replyCount: integer("reply_count").default(0),
    snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  },
  (t) => [index("idx_snapshot_action").on(t.actionId)]
);

// ============================================================
// INTELLIGENCE TABLES (Layer 2 — AI Enrichment)
// ============================================================

export const enrichments = pgTable(
  "enrichments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actionId: uuid("action_id")
      .references(() => actions.id)
      .notNull(),
    // Classification
    sentiment: real("sentiment"), // -1.0 to 1.0
    autonomyScore: real("autonomy_score"), // 0.0 to 1.0 — how self-directed is this content?
    isSubstantive: boolean("is_substantive"), // Does this have real content vs fluff?
    intent: text("intent"), // "inform", "question", "debate", "promote", "spam", "social", "meta"
    // Entities extracted
    entities: jsonb("entities").$type<string[]>(), // Named entities mentioned
    // Topic slugs (denormalized for fast access)
    topicSlugs: jsonb("topic_slugs").$type<string[]>(),
    // Full LLM response for debugging
    rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
    // Processing
    model: text("model"), // e.g. "claude-haiku-4-5-20251001"
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_enrichment_action").on(t.actionId),
    index("idx_enrichment_autonomy").on(t.autonomyScore),
    index("idx_enrichment_sentiment").on(t.sentiment),
  ]
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").unique().notNull(), // e.g. "mcp-security", "agent-autonomy"
    name: text("name").notNull(), // Display name
    description: text("description"),
    // Aggregated stats (recomputed periodically)
    actionCount: integer("action_count").default(0),
    agentCount: integer("agent_count").default(0), // Distinct agents who discussed this
    avgSentiment: real("avg_sentiment"),
    velocity: real("velocity").default(0), // Actions per hour, trailing 24h
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("idx_topic_velocity").on(t.velocity),
    index("idx_topic_action_count").on(t.actionCount),
  ]
);

export const actionTopics = pgTable(
  "action_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actionId: uuid("action_id")
      .references(() => actions.id)
      .notNull(),
    topicId: uuid("topic_id")
      .references(() => topics.id)
      .notNull(),
    relevance: real("relevance").default(1.0), // 0-1 how relevant this topic is to the action
  },
  (t) => [
    uniqueIndex("idx_action_topic_unique").on(t.actionId, t.topicId),
    index("idx_action_topic_topic").on(t.topicId),
  ]
);

// ============================================================
// BEHAVIORAL TABLES (Layer 3 — Analysis)
// ============================================================

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceAgentId: uuid("source_agent_id")
      .references(() => agents.id)
      .notNull(),
    targetAgentId: uuid("target_agent_id")
      .references(() => agents.id)
      .notNull(),
    actionId: uuid("action_id").references(() => actions.id),
    interactionType: text("interaction_type").notNull(), // "reply", "upvote", "follow", "mention"
    weight: real("weight").default(1.0), // Weighted by type: reply=3, upvote=1, follow=2
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_interaction_source").on(t.sourceAgentId),
    index("idx_interaction_target").on(t.targetAgentId),
    index("idx_interaction_created").on(t.createdAt),
  ]
);

export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    // Computed at snapshot time
    influenceScore: real("influence_score"),
    autonomyScore: real("autonomy_score"),
    activityScore: real("activity_score"),
    agentType: text("agent_type"),
    // Activity breakdown
    postCount: integer("post_count").default(0),
    commentCount: integer("comment_count").default(0),
    upvoteCount: integer("upvote_count").default(0),
    topTopics: jsonb("top_topics").$type<string[]>(),
    topCommunities: jsonb("top_communities").$type<string[]>(),
    // Snapshot
    snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_agent_profile_agent").on(t.agentId),
    index("idx_agent_profile_snapshot").on(t.snapshotAt),
  ]
);

// ============================================================
// NARRATIVE TABLES (Layer 4 — Briefings)
// ============================================================

export const narratives = pgTable(
  "narratives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: narrativeTypeEnum("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(), // Markdown
    summary: text("summary"), // 1-2 sentence summary
    // What period does this cover?
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    // Stats for the period
    actionsAnalyzed: integer("actions_analyzed").default(0),
    agentsActive: integer("agents_active").default(0),
    topTopics: jsonb("top_topics").$type<string[]>(),
    topAgents: jsonb("top_agents").$type<string[]>(),
    // Metrics at generation time
    networkAutonomyAvg: real("network_autonomy_avg"),
    networkSentimentAvg: real("network_sentiment_avg"),
    // Processing
    model: text("model"),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_narrative_type").on(t.type),
    index("idx_narrative_generated").on(t.generatedAt),
  ]
);

// ============================================================
// OPERATIONAL TABLES
// ============================================================

export const syncLog = pgTable(
  "sync_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platformId: text("platform_id")
      .references(() => platforms.id)
      .notNull(),
    syncType: text("sync_type").notNull(), // "posts_new", "posts_hot", "comments", "submolts"
    status: text("status").notNull(), // "started", "completed", "failed"
    itemsFetched: integer("items_fetched").default(0),
    itemsIngested: integer("items_ingested").default(0),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("idx_sync_log_platform").on(t.platformId),
    index("idx_sync_log_started").on(t.startedAt),
  ]
);

// ============================================================
// RELATIONS (for Drizzle query builder)
// ============================================================

export const agentsRelations = relations(agents, ({ many }) => ({
  identities: many(agentIdentities),
  actions: many(actions),
  profiles: many(agentProfiles),
  outgoingInteractions: many(interactions, { relationName: "source" }),
  incomingInteractions: many(interactions, { relationName: "target" }),
}));

export const agentIdentitiesRelations = relations(agentIdentities, ({ one }) => ({
  agent: one(agents, {
    fields: [agentIdentities.agentId],
    references: [agents.id],
  }),
  platform: one(platforms, {
    fields: [agentIdentities.platformId],
    references: [platforms.id],
  }),
}));

export const actionsRelations = relations(actions, ({ one, many }) => ({
  agent: one(agents, {
    fields: [actions.agentId],
    references: [agents.id],
  }),
  community: one(communities, {
    fields: [actions.communityId],
    references: [communities.id],
  }),
  enrichment: one(enrichments, {
    fields: [actions.id],
    references: [enrichments.actionId],
  }),
  actionTopics: many(actionTopics),
}));

export const enrichmentsRelations = relations(enrichments, ({ one }) => ({
  action: one(actions, {
    fields: [enrichments.actionId],
    references: [actions.id],
  }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  sourceAgent: one(agents, {
    fields: [interactions.sourceAgentId],
    references: [agents.id],
    relationName: "source",
  }),
  targetAgent: one(agents, {
    fields: [interactions.targetAgentId],
    references: [agents.id],
    relationName: "target",
  }),
  action: one(actions, {
    fields: [interactions.actionId],
    references: [actions.id],
  }),
}));

export const agentProfilesRelations = relations(agentProfiles, ({ one }) => ({
  agent: one(agents, {
    fields: [agentProfiles.agentId],
    references: [agents.id],
  }),
}));

export const actionTopicsRelations = relations(actionTopics, ({ one }) => ({
  action: one(actions, {
    fields: [actionTopics.actionId],
    references: [actions.id],
  }),
  topic: one(topics, {
    fields: [actionTopics.topicId],
    references: [topics.id],
  }),
}));
