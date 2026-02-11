CREATE TABLE "coordination_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_type" text NOT NULL,
	"confidence" real NOT NULL,
	"agent_ids" jsonb NOT NULL,
	"evidence" text,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_agent_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"post_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"upvotes_received" integer DEFAULT 0,
	"avg_sentiment" real,
	"avg_originality" real,
	"unique_topics" integer DEFAULT 0,
	"unique_interlocutors" integer DEFAULT 0,
	"active_hours" jsonb,
	"word_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "daily_topic_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"velocity" real DEFAULT 0,
	"agent_count" integer DEFAULT 0,
	"avg_sentiment" real,
	"action_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "topic_cooccurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id_1" uuid NOT NULL,
	"topic_id_2" uuid NOT NULL,
	"cooccurrence_count" integer DEFAULT 0,
	"last_seen_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "posting_regularity" real;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "peak_hour_utc" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "burst_count_7d" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "community_label" integer;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "originality_score" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "independence_score" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "coordination_signal" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "content_metrics" jsonb;--> statement-breakpoint
ALTER TABLE "daily_agent_stats" ADD CONSTRAINT "daily_agent_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_topic_stats" ADD CONSTRAINT "daily_topic_stats_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_cooccurrences" ADD CONSTRAINT "topic_cooccurrences_topic_id_1_topics_id_fk" FOREIGN KEY ("topic_id_1") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_cooccurrences" ADD CONSTRAINT "topic_cooccurrences_topic_id_2_topics_id_fk" FOREIGN KEY ("topic_id_2") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_coordination_signal_type" ON "coordination_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "idx_coordination_detected" ON "coordination_signals" USING btree ("detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_agent_stats_unique" ON "daily_agent_stats" USING btree ("agent_id","date");--> statement-breakpoint
CREATE INDEX "idx_daily_agent_stats_date" ON "daily_agent_stats" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_topic_stats_unique" ON "daily_topic_stats" USING btree ("topic_id","date");--> statement-breakpoint
CREATE INDEX "idx_daily_topic_stats_date" ON "daily_topic_stats" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_topic_cooccurrence_unique" ON "topic_cooccurrences" USING btree ("topic_id_1","topic_id_2");--> statement-breakpoint
CREATE INDEX "idx_topic_cooccurrence_topic1" ON "topic_cooccurrences" USING btree ("topic_id_1");--> statement-breakpoint
CREATE INDEX "idx_topic_cooccurrence_topic2" ON "topic_cooccurrences" USING btree ("topic_id_2");--> statement-breakpoint
CREATE INDEX "idx_enrichment_originality" ON "enrichments" USING btree ("originality_score");--> statement-breakpoint
CREATE INDEX "idx_enrichment_coordination" ON "enrichments" USING btree ("coordination_signal");