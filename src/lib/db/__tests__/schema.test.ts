import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Database Schema", () => {
  // ---- Table exports ----

  describe("table exports", () => {
    it("exports all expected tables", () => {
      const expectedTables = [
        "platforms",
        "agents",
        "agentIdentities",
        "communities",
        "actions",
        "actionSnapshots",
        "enrichments",
        "topics",
        "actionTopics",
        "interactions",
        "agentProfiles",
        "narratives",
        "syncLog",
      ];
      for (const name of expectedTables) {
        expect(schema).toHaveProperty(name);
      }
    });
  });

  // ---- Enum exports ----

  describe("enum exports", () => {
    it("exports all expected enums", () => {
      expect(schema).toHaveProperty("actionTypeEnum");
      expect(schema).toHaveProperty("platformTypeEnum");
      expect(schema).toHaveProperty("narrativeTypeEnum");
    });

    it("actionTypeEnum contains all expected values", () => {
      const values = schema.actionTypeEnum.enumValues;
      const expected = [
        "post",
        "reply",
        "comment",
        "upvote",
        "downvote",
        "follow",
        "unfollow",
        "create_community",
        "subscribe",
        "unsubscribe",
        "register",
        "update_profile",
        "search",
        "pay",
        "list_service",
        "complete_task",
        "other",
      ];
      expect(values).toEqual(expected);
    });

    it("platformTypeEnum contains all expected values", () => {
      const values = schema.platformTypeEnum.enumValues;
      expect(values).toEqual([
        "social",
        "marketplace",
        "onchain",
        "simulation",
        "other",
      ]);
    });

    it("narrativeTypeEnum contains all expected values", () => {
      const values = schema.narrativeTypeEnum.enumValues;
      expect(values).toEqual([
        "briefing_6h",
        "briefing_daily",
        "alert",
        "weekly_summary",
      ]);
    });
  });

  // ---- Relation exports ----

  describe("relation exports", () => {
    it("exports all expected relations", () => {
      const expectedRelations = [
        "agentsRelations",
        "actionsRelations",
        "enrichmentsRelations",
        "actionTopicsRelations",
      ];
      for (const name of expectedRelations) {
        expect(schema).toHaveProperty(name);
      }
    });
  });

  // ---- agents table columns ----

  describe("agents table", () => {
    it("has expected columns", () => {
      const columns = getTableColumns(schema.agents);
      const expectedColumns = [
        "id",
        "displayName",
        "description",
        "influenceScore",
        "autonomyScore",
        "activityScore",
        "agentType",
        "firstSeenAt",
        "lastSeenAt",
        "totalActions",
        "metadata",
      ];
      for (const col of expectedColumns) {
        expect(columns).toHaveProperty(col);
      }
    });
  });

  // ---- actions table columns ----

  describe("actions table", () => {
    it("has expected columns", () => {
      const columns = getTableColumns(schema.actions);
      const expectedColumns = [
        "id",
        "platformId",
        "platformActionId",
        "agentId",
        "actionType",
        "title",
        "content",
        "url",
        "communityId",
        "parentActionId",
        "upvotes",
        "downvotes",
        "replyCount",
        "isEnriched",
        "performedAt",
        "ingestedAt",
        "rawData",
      ];
      for (const col of expectedColumns) {
        expect(columns).toHaveProperty(col);
      }
    });
  });
});
