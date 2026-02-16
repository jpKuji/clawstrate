CREATE TABLE "onchain_chains" (
  "chain_id" integer PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "is_testnet" boolean DEFAULT false NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "onchain_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "standard" text NOT NULL,
  "role" text NOT NULL,
  "address" text NOT NULL,
  "start_block" integer DEFAULT 0 NOT NULL,
  "abi_version" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "onchain_event_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "standard" text NOT NULL,
  "contract_address" text NOT NULL,
  "block_number" integer NOT NULL,
  "block_time" timestamp NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "event_name" text NOT NULL,
  "event_sig" text,
  "decoded_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8004_agents" (
  "agent_key" text PRIMARY KEY NOT NULL,
  "chain_id" integer NOT NULL,
  "registry_address" text NOT NULL,
  "agent_id" text NOT NULL,
  "owner_address" text,
  "agent_uri" text,
  "agent_wallet" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "registered_tx_hash" text,
  "updated_tx_hash" text,
  "last_event_block" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8004_agent_metadata" (
  "agent_key" text PRIMARY KEY NOT NULL,
  "name" text,
  "description" text,
  "protocols" jsonb,
  "x402_supported" boolean,
  "service_endpoints_json" jsonb,
  "cross_chain_json" jsonb,
  "parse_status" text,
  "field_sources" jsonb,
  "last_parsed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8004_feedbacks" (
  "feedback_key" text PRIMARY KEY NOT NULL,
  "agent_key" text NOT NULL,
  "client_address" text NOT NULL,
  "feedback_index" integer NOT NULL,
  "value_numeric" text,
  "value_decimals" integer,
  "tag1" text,
  "tag2" text,
  "endpoint" text,
  "feedback_uri" text,
  "feedback_hash" text,
  "is_revoked" boolean DEFAULT false NOT NULL,
  "created_tx_hash" text,
  "revoked_tx_hash" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8004_feedback_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "feedback_key" text NOT NULL,
  "responder" text NOT NULL,
  "response_uri" text,
  "response_hash" text,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8004_validations" (
  "request_hash" text PRIMARY KEY NOT NULL,
  "agent_key" text,
  "validator_address" text,
  "request_uri" text,
  "response_score" integer,
  "response_uri" text,
  "response_hash" text,
  "tag" text,
  "status" text DEFAULT 'requested' NOT NULL,
  "requested_tx_hash" text,
  "responded_tx_hash" text,
  "last_updated_block" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc6551_accounts" (
  "account_key" text PRIMARY KEY NOT NULL,
  "chain_id" integer NOT NULL,
  "registry_address" text NOT NULL,
  "account_address" text NOT NULL,
  "token_contract" text NOT NULL,
  "token_id" text NOT NULL,
  "salt" text,
  "implementation" text,
  "created_tx_hash" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc4337_userops" (
  "userop_hash" text PRIMARY KEY NOT NULL,
  "chain_id" integer NOT NULL,
  "entry_point" text,
  "sender" text,
  "paymaster" text,
  "nonce" text,
  "success" boolean,
  "actual_gas_cost" text,
  "actual_gas_used" text,
  "tx_hash" text,
  "block_number" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc8001_coordinations" (
  "intent_hash" text PRIMARY KEY NOT NULL,
  "chain_id" integer NOT NULL,
  "contract_address" text NOT NULL,
  "coordination_type" text,
  "proposer" text,
  "executor" text,
  "status" text DEFAULT 'proposed' NOT NULL,
  "participant_count" integer,
  "accepted_count" integer,
  "coordination_value" text,
  "last_tx_hash" text,
  "last_block" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc7007_aigc_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "contract_address" text NOT NULL,
  "token_id" text NOT NULL,
  "prompt_bytes" text,
  "aigc_data_bytes" text,
  "proof_bytes" text,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "erc7579_module_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "account_address" text NOT NULL,
  "module_type_id" text,
  "module_address" text,
  "event_type" text NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "eip7702_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "tx_hash" text NOT NULL,
  "block_number" integer NOT NULL,
  "sender_eoa" text NOT NULL,
  "authorization_count" integer DEFAULT 0 NOT NULL,
  "authorization_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "onchain_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" text,
  "format" text NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "filters" jsonb,
  "file_content" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "account_usage_daily" ADD COLUMN "onchain_api_calls" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "account_usage_daily" ADD COLUMN "onchain_exports" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "monthly_onchain_api_call_quota" integer DEFAULT 5000;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "monthly_onchain_export_quota" integer DEFAULT 100;
--> statement-breakpoint

ALTER TABLE "onchain_contracts" ADD CONSTRAINT "onchain_contracts_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onchain_event_logs" ADD CONSTRAINT "onchain_event_logs_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8004_agents" ADD CONSTRAINT "erc8004_agents_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8004_agent_metadata" ADD CONSTRAINT "erc8004_agent_metadata_agent_key_erc8004_agents_agent_key_fk" FOREIGN KEY ("agent_key") REFERENCES "public"."erc8004_agents"("agent_key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8004_feedbacks" ADD CONSTRAINT "erc8004_feedbacks_agent_key_erc8004_agents_agent_key_fk" FOREIGN KEY ("agent_key") REFERENCES "public"."erc8004_agents"("agent_key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8004_feedback_responses" ADD CONSTRAINT "erc8004_feedback_responses_feedback_key_erc8004_feedbacks_feedback_key_fk" FOREIGN KEY ("feedback_key") REFERENCES "public"."erc8004_feedbacks"("feedback_key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8004_validations" ADD CONSTRAINT "erc8004_validations_agent_key_erc8004_agents_agent_key_fk" FOREIGN KEY ("agent_key") REFERENCES "public"."erc8004_agents"("agent_key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc6551_accounts" ADD CONSTRAINT "erc6551_accounts_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc4337_userops" ADD CONSTRAINT "erc4337_userops_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc8001_coordinations" ADD CONSTRAINT "erc8001_coordinations_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc7007_aigc_events" ADD CONSTRAINT "erc7007_aigc_events_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erc7579_module_events" ADD CONSTRAINT "erc7579_module_events_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "eip7702_authorizations" ADD CONSTRAINT "eip7702_authorizations_chain_id_onchain_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."onchain_chains"("chain_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onchain_exports" ADD CONSTRAINT "onchain_exports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "idx_onchain_chains_enabled" ON "onchain_chains" USING btree ("enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onchain_contract_unique" ON "onchain_contracts" USING btree ("chain_id","address","role");
--> statement-breakpoint
CREATE INDEX "idx_onchain_contract_standard" ON "onchain_contracts" USING btree ("standard");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onchain_log_unique" ON "onchain_event_logs" USING btree ("chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "idx_onchain_log_block" ON "onchain_event_logs" USING btree ("chain_id","block_number");
--> statement-breakpoint
CREATE INDEX "idx_onchain_log_event" ON "onchain_event_logs" USING btree ("event_name");
--> statement-breakpoint
CREATE INDEX "idx_onchain_log_standard" ON "onchain_event_logs" USING btree ("standard");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_agents_chain_registry" ON "erc8004_agents" USING btree ("chain_id","registry_address");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_agents_owner" ON "erc8004_agents" USING btree ("owner_address");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_agents_updated" ON "erc8004_agents" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_agent_metadata_parse_status" ON "erc8004_agent_metadata" USING btree ("parse_status");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_feedback_agent" ON "erc8004_feedbacks" USING btree ("agent_key");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_feedback_client" ON "erc8004_feedbacks" USING btree ("client_address");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erc8004_feedback_response_unique" ON "erc8004_feedback_responses" USING btree ("tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_validations_agent" ON "erc8004_validations" USING btree ("agent_key");
--> statement-breakpoint
CREATE INDEX "idx_erc8004_validations_validator" ON "erc8004_validations" USING btree ("validator_address");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erc6551_account_address_unique" ON "erc6551_accounts" USING btree ("chain_id","account_address");
--> statement-breakpoint
CREATE INDEX "idx_erc6551_token_ref" ON "erc6551_accounts" USING btree ("chain_id","token_contract","token_id");
--> statement-breakpoint
CREATE INDEX "idx_erc4337_sender" ON "erc4337_userops" USING btree ("sender");
--> statement-breakpoint
CREATE INDEX "idx_erc4337_block" ON "erc4337_userops" USING btree ("chain_id","block_number");
--> statement-breakpoint
CREATE INDEX "idx_erc8001_chain_contract" ON "erc8001_coordinations" USING btree ("chain_id","contract_address");
--> statement-breakpoint
CREATE INDEX "idx_erc8001_status" ON "erc8001_coordinations" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erc7007_event_unique" ON "erc7007_aigc_events" USING btree ("chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "idx_erc7007_contract" ON "erc7007_aigc_events" USING btree ("chain_id","contract_address");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erc7579_event_unique" ON "erc7579_module_events" USING btree ("chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "idx_erc7579_account" ON "erc7579_module_events" USING btree ("chain_id","account_address");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_eip7702_tx_unique" ON "eip7702_authorizations" USING btree ("chain_id","tx_hash");
--> statement-breakpoint
CREATE INDEX "idx_eip7702_sender" ON "eip7702_authorizations" USING btree ("chain_id","sender_eoa");
--> statement-breakpoint
CREATE INDEX "idx_onchain_exports_account" ON "onchain_exports" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "idx_onchain_exports_created" ON "onchain_exports" USING btree ("created_at");
