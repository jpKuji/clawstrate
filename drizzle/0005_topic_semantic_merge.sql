CREATE TABLE "topic_name_aliases" (
	"alias_name_key" text PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_name_aliases" ADD CONSTRAINT "topic_name_aliases_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_topic_name_aliases_topic_id" ON "topic_name_aliases" USING btree ("topic_id");
--> statement-breakpoint
CREATE TABLE "topic_merge_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_key" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT 'v1' NOT NULL,
	"signature" text,
	"candidate_topic_ids" jsonb NOT NULL,
	"canonical_topic_id" uuid,
	"merge_topic_ids" jsonb,
	"confidence" real,
	"rationale" text,
	"llm_output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	"rejected_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "topic_merge_proposals" ADD CONSTRAINT "topic_merge_proposals_canonical_topic_id_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_topic_merge_proposals_key_unique" ON "topic_merge_proposals" USING btree ("proposal_key");
--> statement-breakpoint
CREATE INDEX "idx_topic_merge_proposals_status_created" ON "topic_merge_proposals" USING btree ("status","created_at");

