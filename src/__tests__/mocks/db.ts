import { vi } from "vitest";

// Creates a chainable mock that returns itself for .where(), .set(), etc.
function chainable(terminal?: unknown) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined; // prevent thenable detection
        if (prop === "returning") return () => Promise.resolve(terminal ?? []);
        if (prop === "values") return () => chain;
        if (prop === "set") return () => chain;
        if (prop === "where") return () => chain;
        if (prop === "from") return () => chain;
        if (prop === "innerJoin") return () => chain;
        if (prop === "leftJoin") return () => chain;
        if (prop === "orderBy") return () => chain;
        if (prop === "limit") return () => chain;
        if (prop === "groupBy") return () => chain;
        if (prop === "onConflictDoNothing") return () => chain;
        if (prop === "onConflictDoUpdate") return () => chain;
        return () => chain;
      },
    }
  );
  return chain;
}

export function createMockDb() {
  return {
    select: vi.fn(() => chainable([{ count: 0 }])),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn(() => chainable([{ id: "test-uuid" }])),
    update: vi.fn(() => chainable()),
    delete: vi.fn(() => chainable()),
    query: {
      actions: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      agents: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentIdentities: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      communities: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      enrichments: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      topics: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      topicAliases: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      topicNameAliases: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      actionTopics: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      narratives: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentProfiles: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      interactions: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      platforms: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      syncLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

export type MockDb = ReturnType<typeof createMockDb>;
