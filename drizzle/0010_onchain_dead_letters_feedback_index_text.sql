CREATE TABLE "onchain_ingest_dead_letters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "chain_id" integer NOT NULL,
  "standard" text NOT NULL,
  "contract_address" text NOT NULL,
  "block_number" integer,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "event_name" text NOT NULL,
  "error" text NOT NULL,
  "payload_json" jsonb,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onchain_ingest_dead_letters"
  ADD CONSTRAINT "onchain_ingest_dead_letters_chain_id_onchain_chains_chain_id_fk"
  FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onchain_dead_letter_unique"
  ON "onchain_ingest_dead_letters" USING btree ("scope","chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "idx_onchain_dead_letter_chain"
  ON "onchain_ingest_dead_letters" USING btree ("chain_id","block_number");
--> statement-breakpoint
CREATE INDEX "idx_onchain_dead_letter_last_seen"
  ON "onchain_ingest_dead_letters" USING btree ("last_seen_at");
--> statement-breakpoint
ALTER TABLE "erc8004_feedbacks"
  ALTER COLUMN "feedback_index" TYPE text USING "feedback_index"::text;
