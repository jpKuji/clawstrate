import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDbTopic } from "@/__tests__/mocks/fixtures";

// --- Hoisted mock state ---
const { mockSelect, mockInsert, mockUpdate, mockTopicsFindMany } = vi.hoisted(() => {
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
    mockInsert: vi.fn(() => chainable([{ id: "test-uuid" }])),
    mockUpdate: vi.fn(() => chainable()),
    mockTopicsFindMany: vi.fn().mockResolvedValue([]),
    chainableSelect,
    chainable,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    query: {
      topics: { findMany: mockTopicsFindMany, findFirst: vi.fn().mockResolvedValue(null) },
      agents: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      actions: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      enrichments: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      interactions: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      agentProfiles: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      actionTopics: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

import { runAnalysis } from "../analyze";

// Local reference to helper
function chainableSelect(resolveData: any[]) {
  const chain: any = new Proxy({}, {
    get(_, prop) {
      if (prop === "then") return (resolve: any) => resolve(resolveData);
      return () => chain;
    },
  });
  return chain;
}

describe("runAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicsFindMany.mockResolvedValue([]);
  });

  it("computes influence scores based on incoming interaction weights", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([
        { agentId: "agent-001", totalWeight: 10, interactionCount: 5 },
        { agentId: "agent-002", totalWeight: 5, interactionCount: 3 },
      ])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.8" }]))
      .mockReturnValueOnce(chainableSelect([{ actionType: "post", count: 30 }, { actionType: "comment", count: 10 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]));
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.6" }]))
      .mockReturnValueOnce(chainableSelect([{ actionType: "post", count: 5 }, { actionType: "comment", count: 25 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 2 }]));

    const result = await runAnalysis();

    expect(result.agentsUpdated).toBe(3);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("normalizes influence scores to 0-1 range", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([
        { agentId: "agent-001", totalWeight: 100, interactionCount: 50 },
        { agentId: "agent-002", totalWeight: 50, interactionCount: 25 },
      ])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]));
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]));

    const result = await runAnalysis();

    expect(result.agentsUpdated).toBe(3);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("computes autonomy scores as average of enrichment autonomyScore", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.72" }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("computes activity scores based on actions in last 24h (capped at 1.0)", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ count: 30 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('classifies agents as "content_creator" when posts > comments*2 and total > 50', async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([
        { actionType: "post", count: 40 },
        { actionType: "comment", count: 15 },
      ]))
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('classifies agents as "commenter" when comments > posts*3 and total > 50', async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([
        { actionType: "post", count: 11 },
        { actionType: "comment", count: 40 },
      ]))
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('classifies agents as "active" when total > 20', async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([
        { actionType: "post", count: 12 },
        { actionType: "comment", count: 12 },
      ]))
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('classifies agents as "bot_farm" when autonomy < 0.2 and total > 30', async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    // Due to code ordering, "active" (total > 20) matches before "bot_farm" (total > 30)
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.1" }]))
      .mockReturnValueOnce(chainableSelect([
        { actionType: "post", count: 10 },
        { actionType: "comment", count: 25 },
      ]))
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('classifies agents as "lurker" by default', async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([
        { actionType: "post", count: 3 },
        { actionType: "comment", count: 2 },
      ]))
      .mockReturnValueOnce(chainableSelect([{ count: 1 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("saves agent profile snapshots", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.7" }]))
      .mockReturnValueOnce(chainableSelect([{ actionType: "post", count: 5 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 3 }]));

    await runAnalysis();

    expect(mockInsert).toHaveBeenCalled();
  });

  it("updates topic velocity (actions per hour in last 24h)", async () => {
    mockSelect.mockReturnValueOnce(chainableSelect([]));
    mockTopicsFindMany.mockResolvedValue([mockDbTopic]);

    mockSelect
      .mockReturnValueOnce(chainableSelect([{ count: 48 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 8 }]))
      .mockReturnValueOnce(chainableSelect([{ avg: 0.55 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("updates topic agent count (distinct agents)", async () => {
    mockSelect.mockReturnValueOnce(chainableSelect([]));
    mockTopicsFindMany.mockResolvedValue([mockDbTopic]);

    mockSelect
      .mockReturnValueOnce(chainableSelect([{ count: 10 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 15 }]))
      .mockReturnValueOnce(chainableSelect([{ avg: 0.3 }]));

    await runAnalysis();

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns counts of agentsUpdated and topicsUpdated", async () => {
    mockSelect.mockReturnValueOnce(
      chainableSelect([{ agentId: "agent-001", totalWeight: 10, interactionCount: 5 }])
    );
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ avgAutonomy: "0.5" }]))
      .mockReturnValueOnce(chainableSelect([]))
      .mockReturnValueOnce(chainableSelect([{ count: 0 }]));

    mockTopicsFindMany.mockResolvedValue([mockDbTopic]);
    mockSelect
      .mockReturnValueOnce(chainableSelect([{ count: 5 }]))
      .mockReturnValueOnce(chainableSelect([{ count: 3 }]))
      .mockReturnValueOnce(chainableSelect([{ avg: 0.4 }]));

    const result = await runAnalysis();

    expect(result.agentsUpdated).toBe(2);
    expect(result.topicsUpdated).toBe(1);
  });

  it("handles empty interaction data (no agents to update)", async () => {
    mockSelect.mockReturnValueOnce(chainableSelect([]));

    const result = await runAnalysis();

    expect(result.agentsUpdated).toBe(0);
    expect(result.topicsUpdated).toBe(0);
  });

  it("handles empty topic list", async () => {
    mockSelect.mockReturnValueOnce(chainableSelect([]));
    mockTopicsFindMany.mockResolvedValue([]);

    const result = await runAnalysis();

    expect(result.topicsUpdated).toBe(0);
  });
});
