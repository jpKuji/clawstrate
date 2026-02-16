CREATE TABLE "pipeline_stage_cursors" (
	"stage" text NOT NULL,
	"scope" text NOT NULL,
	"cursor_ts" timestamp NOT NULL,
	"cursor_meta" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stage_cursors_pk" PRIMARY KEY("stage","scope")
);
--> statement-breakpoint
CREATE INDEX "idx_pipeline_stage_cursors_updated" ON "pipeline_stage_cursors" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_action_ingested_platform" ON "actions" USING btree ("ingested_at","platform_id");
--> statement-breakpoint
CREATE INDEX "idx_action_agent_performed" ON "actions" USING btree ("agent_id","performed_at");
--> statement-breakpoint
CREATE INDEX "idx_action_performed_agent" ON "actions" USING btree ("performed_at","agent_id");
--> statement-breakpoint
CREATE INDEX "idx_enrichment_processed_action" ON "enrichments" USING btree ("processed_at","action_id");
--> statement-breakpoint
CREATE INDEX "idx_interaction_created_source_target" ON "interactions" USING btree ("created_at","source_agent_id","target_agent_id");
--> statement-breakpoint
CREATE INDEX "idx_action_topic_topic_action" ON "action_topics" USING btree ("topic_id","action_id");
--> statement-breakpoint
CREATE INDEX "idx_pipeline_stage_status_completed" ON "pipeline_stage_runs" USING btree ("stage","status","completed_at");
