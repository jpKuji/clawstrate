import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockInsert, mockGetStageCursor, mockSetStageCursor } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockInsert = vi.fn(() => {
    const chain: any = {};
    chain.values = () => chain;
    chain.onConflictDoUpdate = () => Promise.resolve([]);
    return chain;
  });
  const mockGetStageCursor = vi.fn();
  const mockSetStageCursor = vi.fn().mockResolvedValue(undefined);
  return { mockExecute, mockInsert, mockGetStageCursor, mockSetStageCursor };
});

vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
  },
}));

vi.mock("../cursors", () => ({
  GLOBAL_CURSOR_SCOPE: "global",
  getBootstrapStart: vi.fn((_stage: string, now: Date) => new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
  getStageCursor: mockGetStageCursor,
  setStageCursor: mockSetStageCursor,
}));

import { runAggregation } from "../aggregate";

describe("runAggregation incremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStageCursor.mockResolvedValue(null);
  });

  it("bootstraps first run and no-ops when there are no impacted days", async () => {
    mockExecute.mockResolvedValueOnce([]); // impacted days

    const result = await runAggregation();

    expect(result).toEqual({ agentsAggregated: 0, topicsAggregated: 0 });
    expect(mockSetStageCursor).toHaveBeenCalledOnce();
    expect(mockSetStageCursor.mock.calls[0][3]).toMatchObject({ reason: "no_changes" });
  });

  it("recomputes impacted prior UTC day for late-arriving data", async () => {
    mockGetStageCursor.mockResolvedValueOnce({
      stage: "aggregate",
      scope: "global",
      cursorTs: new Date("2026-02-13T10:00:00.000Z"),
      cursorMeta: null,
      updatedAt: new Date("2026-02-13T10:00:00.000Z"),
    });

    mockExecute
      .mockResolvedValueOnce([{ date: new Date("2026-02-10T00:00:00.000Z") }]) // impacted days
      .mockResolvedValueOnce([
        {
          agent_id: "agent-1",
          post_count: 3,
          comment_count: 2,
          upvotes_received: 10,
          avg_sentiment: 0.25,
          avg_originality: 0.4,
          active_hours: [8, 9],
          word_count: 120,
        },
      ]) // core agent metrics
      .mockResolvedValueOnce([{ agent_id: "agent-1", unique_topics: 2 }]) // unique topics
      .mockResolvedValueOnce([{ agent_id: "agent-1", unique_interlocutors: 4 }]) // unique interlocutors
      .mockResolvedValueOnce([
        { topic_id: "topic-1", action_count: 7, agent_count: 3, avg_sentiment: 0.3 },
      ]) // topic day stats
      .mockResolvedValueOnce([
        { topic_id_1: "topic-1", topic_id_2: "topic-2", cooccurrence_count: 2 },
      ]); // cooccurrence

    const result = await runAggregation();

    expect(result).toEqual({ agentsAggregated: 1, topicsAggregated: 1 });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockSetStageCursor).toHaveBeenCalledOnce();
    expect(mockSetStageCursor.mock.calls[0][3]).toMatchObject({
      agentsAggregated: 1,
      topicsAggregated: 1,
      impactedDays: ["2026-02-10T00:00:00.000Z"],
    });
  });

  it("does not mutate cursor when invoked for explicit target date", async () => {
    const day = new Date("2026-02-12T00:00:00.000Z");

    mockExecute
      .mockResolvedValueOnce([]) // core agent metrics
      .mockResolvedValueOnce([]) // unique topics
      .mockResolvedValueOnce([]) // unique interlocutors
      .mockResolvedValueOnce([]) // topic day stats
      .mockResolvedValueOnce([]); // cooccurrence

    const result = await runAggregation(day);

    expect(result).toEqual({ agentsAggregated: 0, topicsAggregated: 0 });
    expect(mockSetStageCursor).not.toHaveBeenCalled();
  });
});
