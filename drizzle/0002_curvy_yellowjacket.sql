CREATE TABLE "account_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"briefing_views" integer DEFAULT 0,
	"alert_interactions" integer DEFAULT 0,
	"watchlist_interactions" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"monthly_briefing_view_quota" integer DEFAULT 1000,
	"monthly_alert_interaction_quota" integer DEFAULT 2000,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id_1" uuid NOT NULL,
	"identity_id_2" uuid NOT NULL,
	"link_status" text DEFAULT 'proposed' NOT NULL,
	"confidence" real,
	"rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" text NOT NULL,
	"source" text DEFAULT 'pipeline' NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"event_type" text NOT NULL,
	"narrative_id" uuid,
	"agent_id" uuid,
	"topic_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_topic_cooccurrence_unique";--> statement-breakpoint
ALTER TABLE "coordination_signals" ADD COLUMN "signal_hash" text;--> statement-breakpoint
ALTER TABLE "coordination_signals" ADD COLUMN "window_start" timestamp;--> statement-breakpoint
ALTER TABLE "coordination_signals" ADD COLUMN "window_end" timestamp;--> statement-breakpoint
UPDATE "coordination_signals"
SET
	"signal_hash" = COALESCE("signal_hash", "id"::text),
	"window_start" = COALESCE("window_start", "detected_at"),
	"window_end" = COALESCE("window_end", "detected_at");--> statement-breakpoint
ALTER TABLE "coordination_signals" ALTER COLUMN "signal_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coordination_signals" ALTER COLUMN "window_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coordination_signals" ALTER COLUMN "window_end" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_cooccurrences" ADD COLUMN "date" timestamp;--> statement-breakpoint
UPDATE "topic_cooccurrences"
SET "date" = COALESCE("date", date_trunc('day', COALESCE("last_seen_at", now())));--> statement-breakpoint
ALTER TABLE "topic_cooccurrences" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account_usage_daily" ADD CONSTRAINT "account_usage_daily_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_identity_links" ADD CONSTRAINT "agent_identity_links_identity_id_1_agent_identities_id_fk" FOREIGN KEY ("identity_id_1") REFERENCES "public"."agent_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_identity_links" ADD CONSTRAINT "agent_identity_links_identity_id_2_agent_identities_id_fk" FOREIGN KEY ("identity_id_2") REFERENCES "public"."agent_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage_runs" ADD CONSTRAINT "pipeline_stage_runs_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_narrative_id_narratives_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."narratives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_usage_daily_unique" ON "account_usage_daily" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_account_usage_daily_date" ON "account_usage_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_identity_link_unique" ON "agent_identity_links" USING btree ("identity_id_1","identity_id_2");--> statement-breakpoint
CREATE INDEX "idx_agent_identity_link_status" ON "agent_identity_links" USING btree ("link_status");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_started" ON "pipeline_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_status" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_stage_run_unique" ON "pipeline_stage_runs" USING btree ("pipeline_run_id","stage");--> statement-breakpoint
CREATE INDEX "idx_pipeline_stage_stage" ON "pipeline_stage_runs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_product_events_account" ON "product_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_product_events_type" ON "product_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_product_events_created" ON "product_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_coordination_signal_dedupe" ON "coordination_signals" USING btree ("signal_type","signal_hash","window_start");--> statement-breakpoint
CREATE INDEX "idx_topic_cooccurrence_date" ON "topic_cooccurrences" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_topic_cooccurrence_unique" ON "topic_cooccurrences" USING btree ("topic_id_1","topic_id_2","date");
