import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecute,
  mockSelect,
  mockInsert,
  mockGetStageCursor,
  mockSetStageCursor,
  queueSelectResult,
} = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];

  function chainableSelect(resolveData: unknown[]) {
    const chain: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: unknown[]) => void) => resolve(resolveData);
          return () => chain;
        },
      }
    );
    return chain;
  }

  return {
    mockExecute: vi.fn(),
    mockSelect: vi.fn(() => chainableSelect(selectQueue.shift() || [])),
    mockInsert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    mockGetStageCursor: vi.fn(),
    mockSetStageCursor: vi.fn().mockResolvedValue(undefined),
    queueSelectResult: (rows: unknown[]) => selectQueue.push(rows),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("../cursors", () => ({
  GLOBAL_CURSOR_SCOPE: "global",
  getBootstrapStart: vi.fn((stage: string, now: Date) => {
    if (stage === "aggregate") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  }),
  getStageCursor: mockGetStageCursor,
  setStageCursor: mockSetStageCursor,
}));

import { runAnalysis } from "../analyze";

describe("runAnalysis incremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStageCursor.mockResolvedValue(null);
  });

  it("bootstraps first run and no-ops when no entities changed", async () => {
    mockExecute
      .mockResolvedValueOnce([]) // changed agents
      .mockResolvedValueOnce([]); // changed topics

    const result = await runAnalysis();

    expect(result).toEqual({ agentsUpdated: 0, topicsUpdated: 0 });
    expect(mockSetStageCursor).toHaveBeenCalledOnce();
    expect(mockSetStageCursor.mock.calls[0][2]).toBeInstanceOf(Date);
    expect(mockSetStageCursor.mock.calls[0][3]).toMatchObject({ reason: "no_changes" });
  });

  it("recomputes only changed entities and advances cursor on success", async () => {
    const now = new Date("2026-02-13T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockGetStageCursor.mockResolvedValueOnce({
      stage: "analyze",
      scope: "global",
      cursorTs: new Date("2026-02-13T10:00:00.000Z"),
      cursorMeta: null,
      updatedAt: new Date("2026-02-13T10:00:00.000Z"),
    });

    mockExecute
      .mockResolvedValueOnce([{ agent_id: "agent-1" }]) // changed agents
      .mockResolvedValueOnce([{ topic_id: "topic-1" }]) // changed topics
      .mockResolvedValueOnce([{ action_id: "action-1" }]) // substantive
      .mockResolvedValueOnce([{ agent_id: "agent-1", avg_autonomy: 0.7 }]) // autonomy
      .mockResolvedValueOnce([
        { agent_id: "agent-1", action_type: "post", count: 5 },
        { agent_id: "agent-1", action_type: "comment", count: 2 },
      ]) // breakdown
      .mockResolvedValueOnce([
        {
          agent_id: "agent-1",
          substantive_count: 2,
          non_substantive_count: 1,
          unenriched_count: 0,
        },
      ]) // recent counts
      .mockResolvedValueOnce([
        { topic_id: "topic-1", recent_count: 12, agent_count: 3, avg_sentiment: 0.2 },
      ]) // topic stats
      .mockResolvedValue([]); // fallback for update queries

    queueSelectResult([{ agentId: "agent-1" }]); // active agents
    queueSelectResult([
      { sourceAgentId: "agent-1", targetAgentId: "agent-2", weight: 1, actionId: "action-1" },
    ]); // interactions
    queueSelectResult([]); // identities
    queueSelectResult([{ id: "agent-1", firstSeenAt: new Date("2026-02-10T00:00:00.000Z") }]); // first seen
    queueSelectResult([
      {
        agentId: "agent-1",
        date: new Date("2026-02-10T00:00:00.000Z"),
        postCount: 2,
        commentCount: 1,
        activeHours: [10],
      },
      {
        agentId: "agent-1",
        date: new Date("2026-02-11T00:00:00.000Z"),
        postCount: 2,
        commentCount: 1,
        activeHours: [10],
      },
      {
        agentId: "agent-1",
        date: new Date("2026-02-12T00:00:00.000Z"),
        postCount: 3,
        commentCount: 1,
        activeHours: [11],
      },
    ]); // daily stats

    const result = await runAnalysis();

    expect(result.agentsUpdated).toBe(1);
    expect(result.topicsUpdated).toBe(1);
    expect(mockInsert).toHaveBeenCalled(); // agent profile snapshot insert
    expect(mockSetStageCursor).toHaveBeenCalledOnce();
    expect(mockSetStageCursor.mock.calls[0][3]).toMatchObject({
      changedAgents: 1,
      changedTopics: 1,
      agentsUpdated: 1,
      topicsUpdated: 1,
    });

    vi.useRealTimers();
  });

  it("does not advance cursor when analysis throws", async () => {
    mockExecute
      .mockResolvedValueOnce([{ agent_id: "agent-1" }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("boom"));

    queueSelectResult([]);
    queueSelectResult([]);

    await expect(runAnalysis()).rejects.toThrow("boom");
    expect(mockSetStageCursor).not.toHaveBeenCalled();
  });
});
