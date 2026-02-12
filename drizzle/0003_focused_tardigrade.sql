ALTER TABLE "topics" ADD COLUMN "name_key" text;
--> statement-breakpoint
CREATE INDEX "idx_topics_name_key" ON "topics" USING btree ("name_key");
--> statement-breakpoint
CREATE TABLE "topic_aliases" (
	"alias_slug" text PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_aliases" ADD CONSTRAINT "topic_aliases_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_topic_aliases_topic_id" ON "topic_aliases" USING btree ("topic_id");

