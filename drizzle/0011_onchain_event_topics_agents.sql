CREATE TABLE "onchain_event_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "block_time" timestamp NOT NULL,
  "standard" text NOT NULL,
  "event_name" text NOT NULL,
  "topic_slug" text NOT NULL,
  "topic_name" text NOT NULL,
  "relevance" real DEFAULT 1 NOT NULL,
  "origin" text DEFAULT 'deterministic' NOT NULL,
  "intent" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onchain_event_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "block_time" timestamp NOT NULL,
  "standard" text NOT NULL,
  "event_name" text NOT NULL,
  "agent_key" text NOT NULL,
  "role" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onchain_event_topics" ADD CONSTRAINT "onchain_event_topics_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onchain_event_agents" ADD CONSTRAINT "onchain_event_agents_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onchain_event_agents" ADD CONSTRAINT "onchain_event_agents_agent_key_erc8004_agents_agent_key_fk" FOREIGN KEY ("agent_key") REFERENCES "public"."erc8004_agents"("agent_key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onchain_event_topic_unique" ON "onchain_event_topics" USING btree ("chain_id","tx_hash","log_index","topic_slug");
--> statement-breakpoint
CREATE INDEX "idx_onchain_event_topic_slug" ON "onchain_event_topics" USING btree ("topic_slug");
--> statement-breakpoint
CREATE INDEX "idx_onchain_event_topic_block_time" ON "onchain_event_topics" USING btree ("block_time");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onchain_event_agent_unique" ON "onchain_event_agents" USING btree ("chain_id","tx_hash","log_index","agent_key");
--> statement-breakpoint
CREATE INDEX "idx_onchain_event_agent_agent_key" ON "onchain_event_agents" USING btree ("agent_key");
--> statement-breakpoint
CREATE INDEX "idx_onchain_event_agent_block_time" ON "onchain_event_agents" USING btree ("block_time");
