import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InsertedSignal = {
  signalType: string;
  signalHash: string;
  windowStart: Date;
  windowEnd: Date;
  confidence: number;
  agentIds: string[];
  evidence: string;
};

const {
  mockExecute,
  mockSelect,
  mockInsert,
  mockGetStageCursor,
  mockSetStageCursor,
  queueExecute,
  queueSelect,
  insertedSignals,
  dedupeKeys,
  resetState,
} = vi.hoisted(() => {
  const executeQueue: unknown[][] = [];
  const selectQueue: unknown[][] = [];
  const dedupeKeys = new Set<string>();
  const insertedSignals: InsertedSignal[] = [];

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

  const mockInsert = vi.fn(() => {
    let values: InsertedSignal[] = [];
    const chain: any = {};

    chain.values = (value: InsertedSignal | InsertedSignal[]) => {
      values = Array.isArray(value) ? value : [value];
      return chain;
    };
    chain.onConflictDoNothing = () => chain;
    chain.returning = () => {
      const ids: Array<{ id: string }> = [];
      for (const row of values) {
        const key = `${row.signalType}|${row.signalHash}|${new Date(row.windowStart).toISOString()}`;
        if (dedupeKeys.has(key)) continue;
        dedupeKeys.add(key);
        insertedSignals.push(row);
        ids.push({ id: key });
      }
      return Promise.resolve(ids);
    };

    return chain;
  });

  return {
    mockExecute: vi.fn(() => Promise.resolve(executeQueue.shift() || [])),
    mockSelect: vi.fn(() => chainableSelect(selectQueue.shift() || [])),
    mockInsert,
    mockGetStageCursor: vi.fn(),
    mockSetStageCursor: vi.fn().mockResolvedValue(undefined),
    queueExecute: (rows: unknown[]) => executeQueue.push(rows),
    queueSelect: (rows: unknown[]) => selectQueue.push(rows),
    insertedSignals,
    dedupeKeys,
    resetState: () => {
      executeQueue.length = 0;
      selectQueue.length = 0;
      dedupeKeys.clear();
      insertedSignals.length = 0;
    },
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
  getBootstrapStart: vi.fn((_stage: string, now: Date) => new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)),
  getStageCursor: mockGetStageCursor,
  setStageCursor: mockSetStageCursor,
}));

import { detectCoordination } from "../coordination";

function queueDataset() {
  queueExecute([
    {
      topic_id: "topic-alpha",
      topic_slug: "alpha",
      bucket_start: new Date("2026-02-11T10:00:00.000Z"),
      agent_ids: ["agent-a", "agent-b", "agent-c"],
    },
  ]);
  queueSelect([]); // interactions between candidate agents

  queueExecute([
    {
      agent_id_1: "agent-a",
      agent_id_2: "agent-b",
      intersection_count: 4,
      union_count: 4,
      similarity: 1,
    },
  ]);

  queueSelect([
    { sourceAgentId: "agent-a", targetAgentId: "agent-b" },
    { sourceAgentId: "agent-a", targetAgentId: "agent-c" },
    { sourceAgentId: "agent-b", targetAgentId: "agent-c" },
    { sourceAgentId: "agent-c", targetAgentId: "agent-a" },
  ]);
}

describe("detectCoordination incremental", () => {
  beforeEach(() => {
    resetState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T12:00:00.000Z"));
    mockGetStageCursor.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is idempotent on unchanged data and only advances cursor on successful run", async () => {
    queueDataset();
    queueDataset();

    const first = await detectCoordination();
    expect(first.errors).toEqual([]);
    expect(first.signalsDetected).toBe(3);

    const second = await detectCoordination();
    expect(second.errors).toEqual([]);
    expect(second.signalsDetected).toBe(0);

    expect(mockSetStageCursor).toHaveBeenCalledTimes(2);
    expect(insertedSignals).toHaveLength(3);
  });

  it("keeps bounded drift checks within configured thresholds", async () => {
    queueDataset();
    const baseline = await detectCoordination();
    const baselineSignals = [...insertedSignals];

    // Re-run with same dataset but fresh dedupe set to compare raw detection volumes.
    dedupeKeys.clear();
    insertedSignals.length = 0;
    queueDataset();
    const approx = await detectCoordination();
    const approxSignals = [...insertedSignals];

    const baselineTotal = baseline.signalsDetected;
    const approxTotal = approx.signalsDetected;
    const totalDrift = Math.abs(approxTotal - baselineTotal) / Math.max(baselineTotal, 1);

    expect(totalDrift).toBeLessThanOrEqual(0.1);

    const byType = (signals: InsertedSignal[]) =>
      signals.reduce<Record<string, number>>((acc, signal) => {
        acc[signal.signalType] = (acc[signal.signalType] || 0) + 1;
        return acc;
      }, {});

    const baselineCounts = byType(baselineSignals);
    const approxCounts = byType(approxSignals);
    for (const type of ["temporal_cluster", "content_similarity", "reply_clique"]) {
      const a = baselineCounts[type] || 0;
      const b = approxCounts[type] || 0;
      const drift = Math.abs(a - b) / Math.max(a, 1);
      expect(drift).toBeLessThanOrEqual(0.15);
    }
  });
});
