import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockDbAction,
  mockEnrichmentResponse,
  mockEnrichmentResponseMulti,
  mockDbTopic,
} from "@/__tests__/mocks/fixtures";

// --- Mock Anthropic ---
const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

// --- Mock DB with chainable helpers ---
function chainable(terminal?: unknown) {
  const chain: any = new Proxy({}, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "returning") return () => Promise.resolve(terminal ?? [{ id: "test-uuid" }]);
      return () => chain;
    },
  });
  return chain;
}

const mockInsert = vi.fn(() => chainable([{ id: "test-uuid" }]));
const mockUpdate = vi.fn(() => chainable());
const mockSelect = vi.fn(() => chainable([{ count: 0 }]));
const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindFirst = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    query: {
      actions: { findMany: mockFindMany, findFirst: mockFindFirst },
      topics: { findFirst: vi.fn().mockResolvedValue(null) },
      topicAliases: { findFirst: vi.fn().mockResolvedValue(null) },
      topicNameAliases: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

describe("runEnrichment", () => {
  let runEnrichment: typeof import("../enrich").runEnrichment;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(mockEnrichmentResponse) }],
    });

    vi.resetModules();
    const mod = await import("../enrich");
    runEnrichment = mod.runEnrichment;
  });

  it("returns early with enriched:0 when no un-enriched actions exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await runEnrichment();

    expect(result.enriched).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("processes actions in batches of 10", async () => {
    const unenrichedActions = Array.from({ length: 15 }, (_, i) => ({
      ...mockDbAction,
      id: `action-uuid-${i}`,
      platformActionId: `post_post-${String(i).padStart(3, "0")}`,
      isEnriched: false,
    }));
    mockFindMany.mockResolvedValue(unenrichedActions);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    });

    await runEnrichment();

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  it("sends correct prompt to Anthropic API with action data", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);

    await runEnrichment();

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: expect.stringContaining(action.platformActionId),
          },
        ],
      })
    );
  });

  it("parses JSON response from Anthropic correctly", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);

    const result = await runEnrichment();

    expect(result.enriched).toBe(1);
    expect(result.errors).toEqual([]);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("handles markdown-wrapped JSON (```json ... ```)", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);
    const wrappedJson = "```json\n" + JSON.stringify(mockEnrichmentResponse) + "\n```";
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: wrappedJson }],
    });

    const result = await runEnrichment();

    expect(result.enriched).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("creates enrichment record for each result", async () => {
    const actions = [
      { ...mockDbAction, id: "action-uuid-001", platformActionId: "post_post-001", isEnriched: false },
      { ...mockDbAction, id: "action-uuid-002", platformActionId: "post_post-002", isEnriched: false },
    ];
    mockFindMany.mockResolvedValue(actions);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(mockEnrichmentResponseMulti) }],
    });

    const result = await runEnrichment();

    expect(result.enriched).toBe(2);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("upserts topics and creates action-topic links", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);

    const result = await runEnrichment();

    expect(result.enriched).toBe(1);
    // enrichment + 2 topics + 2 actionTopics = multiple inserts
    expect(mockInsert).toHaveBeenCalled();
  });

  it("marks actions as enriched after processing", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);

    await runEnrichment();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("handles JSON parse errors gracefully (adds to errors, continues)", async () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({
      ...mockDbAction,
      id: `action-uuid-${i}`,
      platformActionId: `post_post-${String(i).padStart(3, "0")}`,
      isEnriched: false,
    }));
    mockFindMany.mockResolvedValue(actions);
    mockAnthropicCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not valid json {{{" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "[]" }],
      });

    const result = await runEnrichment();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("JSON parse error");
  });

  it("handles Anthropic API errors gracefully (adds to errors, continues)", async () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({
      ...mockDbAction,
      id: `action-uuid-${i}`,
      platformActionId: `post_post-${String(i).padStart(3, "0")}`,
      isEnriched: false,
    }));
    mockFindMany.mockResolvedValue(actions);
    mockAnthropicCreate
      .mockRejectedValueOnce(new Error("API rate limit exceeded"))
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "[]" }],
      });

    const result = await runEnrichment();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("API call");
  });

  it("skips results that don't match any action in the batch", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);
    const mismatchedResult = [{
      id: "nonexistent_post_999",
      sentiment: 0.5,
      autonomyScore: 0.5,
      isSubstantive: true,
      intent: "inform",
      topics: [],
      entities: [],
    }];
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(mismatchedResult) }],
    });

    const result = await runEnrichment();

    expect(result.enriched).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("processes up to 100 un-enriched actions per run", async () => {
    const manyActions = Array.from({ length: 100 }, (_, i) => ({
      ...mockDbAction,
      id: `action-uuid-${i}`,
      platformActionId: `post_post-${String(i).padStart(3, "0")}`,
      isEnriched: false,
    }));
    mockFindMany.mockResolvedValue(manyActions);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    });

    await runEnrichment();

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(10);
  });

  it("uses claude-haiku-4-5-20251001 model", async () => {
    const action = { ...mockDbAction, isEnriched: false };
    mockFindMany.mockResolvedValue([action]);

    await runEnrichment();

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
      })
    );
  });

  it("uses deterministic enrichment for RentAHuman assignment comments", async () => {
    const assignmentAction = {
      ...mockDbAction,
      id: "assignment-action-1",
      platformId: "rentahuman",
      actionType: "comment",
      platformActionId: "assignment_b1_h1",
      rawData: { kind: "assignment" },
      isEnriched: false,
    };
    mockFindMany.mockResolvedValue([assignmentAction]);

    const result = await runEnrichment();

    expect(result.enriched).toBe(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
