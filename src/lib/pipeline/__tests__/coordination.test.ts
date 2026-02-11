import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

type InsertedSignal = {
  signalType: string;
  signalHash: string;
  windowStart: Date;
  windowEnd: Date;
};

let mockDb: {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

const selectQueue: unknown[][] = [];
const dedupeKeys = new Set<string>();
const insertedSignals: InsertedSignal[] = [];

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { detectCoordination } from "../coordination";

function selectChain(terminal: unknown) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(terminal);
        }
        return () => chain;
      },
    }
  );
  return chain;
}

function queueDetectionDataset() {
  selectQueue.push(
    [
      {
        topicId: "topic-alpha",
        topicSlug: "alpha",
        agentId: "agent-a",
        performedAt: new Date("2026-02-11T10:00:00.000Z"),
      },
      {
        topicId: "topic-alpha",
        topicSlug: "alpha",
        agentId: "agent-b",
        performedAt: new Date("2026-02-11T10:30:00.000Z"),
      },
      {
        topicId: "topic-alpha",
        topicSlug: "alpha",
        agentId: "agent-c",
        performedAt: new Date("2026-02-11T11:00:00.000Z"),
      },
    ],
    [{ count: 0 }],
    [
      { agentId: "agent-a", topicId: "topic-1" },
      { agentId: "agent-a", topicId: "topic-2" },
      { agentId: "agent-a", topicId: "topic-3" },
      { agentId: "agent-b", topicId: "topic-1" },
      { agentId: "agent-b", topicId: "topic-2" },
      { agentId: "agent-b", topicId: "topic-3" },
    ],
    [
      { sourceAgentId: "agent-a", targetAgentId: "agent-b" },
      { sourceAgentId: "agent-a", targetAgentId: "agent-c" },
      { sourceAgentId: "agent-b", targetAgentId: "agent-c" },
      { sourceAgentId: "agent-c", targetAgentId: "agent-a" },
    ]
  );
}

describe("detectCoordination idempotency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T12:34:00.000Z"));
    selectQueue.length = 0;
    dedupeKeys.clear();
    insertedSignals.length = 0;

    mockDb = {
      select: vi.fn(() => {
        const next = selectQueue.shift();
        if (!next) {
          throw new Error("No mocked select result queued");
        }
        return selectChain(next);
      }),
      insert: vi.fn(() => {
        let pending: InsertedSignal | null = null;
        const chain: any = {};
        chain.values = (value: InsertedSignal) => {
          pending = value;
          return chain;
        };
        chain.onConflictDoNothing = () => chain;
        chain.returning = () => {
          if (!pending) return Promise.resolve([]);
          const key = `${pending.signalType}|${pending.signalHash}|${new Date(pending.windowStart).toISOString()}`;
          if (dedupeKeys.has(key)) {
            return Promise.resolve([]);
          }
          dedupeKeys.add(key);
          insertedSignals.push(pending);
          return Promise.resolve([{ id: key }]);
        };
        return chain;
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not create duplicate signals when rerun on unchanged data", async () => {
    queueDetectionDataset();
    queueDetectionDataset();

    const firstRun = await detectCoordination();
    expect(firstRun.errors).toEqual([]);
    expect(firstRun.signalsDetected).toBe(3);

    vi.setSystemTime(new Date("2026-02-11T13:34:00.000Z"));
    const secondRun = await detectCoordination();
    expect(secondRun.errors).toEqual([]);
    expect(secondRun.signalsDetected).toBe(0);
    expect(insertedSignals).toHaveLength(3);

    const contentSimilarity = insertedSignals.find((s) => s.signalType === "content_similarity");
    const replyClique = insertedSignals.find((s) => s.signalType === "reply_clique");
    expect(contentSimilarity).toBeDefined();
    expect(replyClique).toBeDefined();
    expect(new Date(contentSimilarity!.windowStart).toISOString()).toBe("2026-02-04T00:00:00.000Z");
    expect(new Date(replyClique!.windowStart).toISOString()).toBe("2026-02-04T00:00:00.000Z");
  });
});
