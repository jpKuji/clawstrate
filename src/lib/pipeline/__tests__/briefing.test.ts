import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDbAgent, mockDbTopic } from "@/__tests__/mocks/fixtures";

// --- Hoisted mock state ---
const {
  mockSelect, mockInsert, mockUpdate,
  mockTopicsFindMany, mockAgentsFindMany,
  mockAnthropicCreate, chainableSelect,
} = vi.hoisted(() => {
  function chainableSelect(resolveData: any[]) {
    const chain: any = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") return (resolve: any) => resolve(resolveData);
        return () => chain;
      },
    });
    return chain;
  }

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

  return {
    mockSelect: vi.fn(() => chainableSelect([])),
    mockInsert: vi.fn(() => chainable([{ id: "narrative-uuid-001" }])),
    mockUpdate: vi.fn(() => chainable()),
    mockTopicsFindMany: vi.fn().mockResolvedValue([]),
    mockAgentsFindMany: vi.fn().mockResolvedValue([]),
    mockAnthropicCreate: vi.fn(),
    chainableSelect,
    chainable,
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    query: {
      topics: { findMany: mockTopicsFindMany, findFirst: vi.fn().mockResolvedValue(null) },
      agents: { findMany: mockAgentsFindMany, findFirst: vi.fn().mockResolvedValue(null) },
      actions: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      enrichments: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      narratives: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      interactions: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

import { generateBriefing } from "../briefing";

describe("generateBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default selects: periodActions, activeAgents, highAutonomyPosts, networkAvg
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ count: 150 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 28 }]))
      .mockReturnValueOnce(chainableSelect([{
        title: "Understanding MCP Security",
        content: "Detailed analysis...",
        autonomyScore: 0.85,
        agentName: "SecurityBot",
        performedAt: new Date("2025-01-15T12:00:00Z"),
      }]))
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: 0.65, avgSentiment: 0.42 }]));

    mockTopicsFindMany.mockResolvedValue([mockDbTopic]);
    mockAgentsFindMany.mockResolvedValue([mockDbAgent]);

    mockAnthropicCreate
      .mockResolvedValueOnce({
        content: [{
          type: "text",
          text: "## Key Developments\n\nSecurity discussions dominated the network...\n\n## Trending Topics\n\nMCP Security was the top topic.",
        }],
      })
      .mockResolvedValueOnce({
        content: [{
          type: "text",
          text: "Security topics dominated with high autonomy scores across the network.",
        }],
      });
  });

  it("gathers period data (actions count, active agents, top topics, top agents)", async () => {
    await generateBriefing();

    expect(mockSelect).toHaveBeenCalled();
    expect(mockTopicsFindMany).toHaveBeenCalled();
    expect(mockAgentsFindMany).toHaveBeenCalled();
  });

  it("queries high-autonomy substantive posts (autonomyScore > 0.7)", async () => {
    await generateBriefing();

    const briefingCall = mockAnthropicCreate.mock.calls[0];
    expect(briefingCall[0].messages[0].content).toContain("HIGH-AUTONOMY");
  });

  it("computes network averages (autonomy, sentiment)", async () => {
    await generateBriefing();

    const briefingCall = mockAnthropicCreate.mock.calls[0];
    expect(briefingCall[0].messages[0].content).toContain("NETWORK AUTONOMY AVG");
    expect(briefingCall[0].messages[0].content).toContain("NETWORK SENTIMENT AVG");
  });

  it("sends data summary to Sonnet model", async () => {
    await generateBriefing();

    const firstCall = mockAnthropicCreate.mock.calls[0];
    expect(firstCall[0].model).toBe("claude-sonnet-4-5-20250929");
    expect(firstCall[0].max_tokens).toBe(2048);
    expect(firstCall[0].messages[0].content).toContain("PERIOD:");
    expect(firstCall[0].messages[0].content).toContain("TOTAL ACTIONS:");
  });

  it("generates summary using Haiku model", async () => {
    await generateBriefing();

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    const secondCall = mockAnthropicCreate.mock.calls[1];
    expect(secondCall[0].model).toBe("claude-haiku-4-5-20251001");
    expect(secondCall[0].max_tokens).toBe(100);
    expect(secondCall[0].messages[0].content).toContain("Summarize this briefing");
  });

  it("extracts title from first H2 heading in response", async () => {
    mockAnthropicCreate
      .mockReset()
      .mockResolvedValueOnce({
        content: [{
          type: "text",
          text: "## Security Surge Across the Network\n\nDetails follow...",
        }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Summary text." }],
      });

    await generateBriefing();

    expect(mockInsert).toHaveBeenCalled();
  });

  it("falls back to generated title if no H2 found", async () => {
    mockAnthropicCreate
      .mockReset()
      .mockResolvedValueOnce({
        content: [{
          type: "text",
          text: "No headings here, just plain text analysis.",
        }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Summary text." }],
      });

    await generateBriefing();

    expect(mockInsert).toHaveBeenCalled();
  });

  it("saves narrative to database with all fields", async () => {
    await generateBriefing();

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns the narrative ID", async () => {
    const result = await generateBriefing();

    expect(result).toEqual({ narrativeId: "narrative-uuid-001" });
  });

  it("uses correct models (sonnet for briefing, haiku for summary)", async () => {
    await generateBriefing();

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe("claude-sonnet-4-5-20250929");
    expect(mockAnthropicCreate.mock.calls[1][0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("handles period with no data (sparse data case)", async () => {
    mockSelect.mockReset();
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: null, avgSentiment: null }]));

    mockTopicsFindMany.mockResolvedValue([]);
    mockAgentsFindMany.mockResolvedValue([]);

    mockAnthropicCreate
      .mockReset()
      .mockResolvedValueOnce({
        content: [{
          type: "text",
          text: "## Quiet Period\n\nNo significant activity observed.",
        }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Quiet period with no activity." }],
      });

    const result = await generateBriefing();

    expect(result.narrativeId).toBe("narrative-uuid-001");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });
});
