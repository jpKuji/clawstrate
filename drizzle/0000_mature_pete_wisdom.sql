CREATE TYPE "public"."action_type" AS ENUM('post', 'reply', 'comment', 'upvote', 'downvote', 'follow', 'unfollow', 'create_community', 'subscribe', 'unsubscribe', 'register', 'update_profile', 'search', 'pay', 'list_service', 'complete_task', 'other');--> statement-breakpoint
CREATE TYPE "public"."narrative_type" AS ENUM('briefing_6h', 'briefing_daily', 'alert', 'weekly_summary');--> statement-breakpoint
CREATE TYPE "public"."platform_type" AS ENUM('social', 'marketplace', 'onchain', 'simulation', 'other');--> statement-breakpoint
CREATE TABLE "action_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"upvotes" integer DEFAULT 0,
	"downvotes" integer DEFAULT 0,
	"reply_count" integer DEFAULT 0,
	"snapshot_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"relevance" real DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" text NOT NULL,
	"platform_action_id" text NOT NULL,
	"agent_id" uuid,
	"agent_identity_id" uuid,
	"action_type" "action_type" NOT NULL,
	"title" text,
	"content" text,
	"url" text,
	"community_id" uuid,
	"parent_action_id" uuid,
	"upvotes" integer DEFAULT 0,
	"downvotes" integer DEFAULT 0,
	"reply_count" integer DEFAULT 0,
	"is_enriched" boolean DEFAULT false,
	"performed_at" timestamp NOT NULL,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	"raw_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"platform_id" text NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_username" text,
	"platform_karma" integer,
	"platform_followers" integer,
	"platform_following" integer,
	"is_claimed" boolean,
	"owner_info" jsonb,
	"raw_profile" jsonb,
	"last_synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"influence_score" real,
	"autonomy_score" real,
	"activity_score" real,
	"agent_type" text,
	"post_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"upvote_count" integer DEFAULT 0,
	"top_topics" jsonb,
	"top_communities" jsonb,
	"snapshot_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"influence_score" real DEFAULT 0,
	"autonomy_score" real DEFAULT 0,
	"activity_score" real DEFAULT 0,
	"agent_type" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"total_actions" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" text NOT NULL,
	"platform_community_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"description" text,
	"subscriber_count" integer,
	"post_count" integer,
	"metadata" jsonb,
	"last_synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"sentiment" real,
	"autonomy_score" real,
	"is_substantive" boolean,
	"intent" text,
	"entities" jsonb,
	"topic_slugs" jsonb,
	"raw_response" jsonb,
	"model" text,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_agent_id" uuid NOT NULL,
	"target_agent_id" uuid NOT NULL,
	"action_id" uuid,
	"interaction_type" text NOT NULL,
	"weight" real DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "narrative_type" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"actions_analyzed" integer DEFAULT 0,
	"agents_active" integer DEFAULT 0,
	"top_topics" jsonb,
	"top_agents" jsonb,
	"network_autonomy_avg" real,
	"network_sentiment_avg" real,
	"model" text,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "platform_type" NOT NULL,
	"api_base" text,
	"config" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" text NOT NULL,
	"sync_type" text NOT NULL,
	"status" text NOT NULL,
	"items_fetched" integer DEFAULT 0,
	"items_ingested" integer DEFAULT 0,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"action_count" integer DEFAULT 0,
	"agent_count" integer DEFAULT 0,
	"avg_sentiment" real,
	"velocity" real DEFAULT 0,
	"first_seen_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "action_snapshots" ADD CONSTRAINT "action_snapshots_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_topics" ADD CONSTRAINT "action_topics_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_topics" ADD CONSTRAINT "action_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_agent_identity_id_agent_identities_id_fk" FOREIGN KEY ("agent_identity_id") REFERENCES "public"."agent_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_source_agent_id_agents_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_target_agent_id_agents_id_fk" FOREIGN KEY ("target_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_snapshot_action" ON "action_snapshots" USING btree ("action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_topic_unique" ON "action_topics" USING btree ("action_id","topic_id");--> statement-breakpoint
CREATE INDEX "idx_action_topic_topic" ON "action_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_platform_unique" ON "actions" USING btree ("platform_id","platform_action_id");--> statement-breakpoint
CREATE INDEX "idx_action_agent" ON "actions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_action_type" ON "actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_action_performed" ON "actions" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "idx_action_community" ON "actions" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_action_enriched" ON "actions" USING btree ("is_enriched");--> statement-breakpoint
CREATE INDEX "idx_action_parent" ON "actions" USING btree ("parent_action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_identity_unique" ON "agent_identities" USING btree ("platform_id","platform_user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_identity_agent" ON "agent_identities" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_profile_agent" ON "agent_profiles" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_profile_snapshot" ON "agent_profiles" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_agents_influence" ON "agents" USING btree ("influence_score");--> statement-breakpoint
CREATE INDEX "idx_agents_autonomy" ON "agents" USING btree ("autonomy_score");--> statement-breakpoint
CREATE INDEX "idx_agents_last_seen" ON "agents" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_community_unique" ON "communities" USING btree ("platform_id","platform_community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_enrichment_action" ON "enrichments" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "idx_enrichment_autonomy" ON "enrichments" USING btree ("autonomy_score");--> statement-breakpoint
CREATE INDEX "idx_enrichment_sentiment" ON "enrichments" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "idx_interaction_source" ON "interactions" USING btree ("source_agent_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_target" ON "interactions" USING btree ("target_agent_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_created" ON "interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_narrative_type" ON "narratives" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_narrative_generated" ON "narratives" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "idx_sync_log_platform" ON "sync_log" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "idx_sync_log_started" ON "sync_log" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_topic_velocity" ON "topics" USING btree ("velocity");--> statement-breakpoint
CREATE INDEX "idx_topic_action_count" ON "topics" USING btree ("action_count");