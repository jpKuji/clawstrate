-- NOTE: Apply only after:
-- 1) Backfilling topics.name_key for all rows, and
-- 2) Merging duplicates so name_key is unique.
-- Recommended: run scripts/merge-topic-duplicates.ts before applying this migration.
ALTER TABLE "topics" ALTER COLUMN "name_key" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_topics_name_key_unique" ON "topics" USING btree ("name_key");
