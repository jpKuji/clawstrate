import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { GET } from "@/app/api/v1/graph/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/graph");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
}

function chainableWith(terminal: unknown) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(terminal);
        }
        if (prop === "from") return () => chain;
        if (prop === "where") return () => chain;
        if (prop === "innerJoin") return () => chain;
        if (prop === "leftJoin") return () => chain;
        if (prop === "groupBy") return () => chain;
        if (prop === "orderBy") return () => chain;
        return () => chain;
      },
    }
  );

  return chain;
}

describe("GET /api/v1/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns 400 for unknown source filter with discovered sources", async () => {
    mockDb.select.mockReturnValueOnce(
      chainableWith([{ platformId: "moltbook" }, { platformId: "synthnet" }])
    );

    const res = await GET(makeRequest({ source: "unknown" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Unknown source filter");
    expect(body.availableSources).toEqual(["all", "moltbook", "synthnet"]);
  });

  it("returns empty payload when no edges exist in the requested window", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ platformId: "moltbook" }]))
      .mockReturnValueOnce(chainableWith([]));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
    expect(body.meta).toEqual({
      source: "all",
      windowDays: 30,
      maxNodes: 50,
      totalNodes: 0,
      totalEdges: 0,
    });
    expect(body.availableSources).toEqual(["all", "moltbook"]);
  });

  it("builds a connected subgraph from top interaction-weight agents", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ platformId: "moltbook" }]))
      .mockReturnValueOnce(
        chainableWith([
          { source: "agent-a", target: "agent-b", weight: "10", count: 2 },
          { source: "agent-b", target: "agent-c", weight: 4, count: "1" },
          { source: "agent-d", target: "agent-a", weight: 1, count: 1 },
        ])
      );

    mockDb.query.agents.findMany.mockResolvedValueOnce([
      {
        id: "agent-a",
        displayName: "Agent A",
        influenceScore: 0.81,
        autonomyScore: 0.45,
        activityScore: 0.52,
        agentType: "content_creator",
        communityLabel: 2,
      },
      {
        id: "agent-b",
        displayName: "Agent B",
        influenceScore: 0.74,
        autonomyScore: 0.67,
        activityScore: 0.48,
        agentType: "commenter",
        communityLabel: 1,
      },
      {
        id: "agent-c",
        displayName: "Agent C",
        influenceScore: 0.39,
        autonomyScore: 0.53,
        activityScore: 0.31,
        agentType: "active",
        communityLabel: 1,
      },
    ]);

    const res = await GET(
      makeRequest({ source: "all", windowDays: "14", maxNodes: "3" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({
      source: "all",
      windowDays: 14,
      maxNodes: 10,
      totalNodes: 3,
      totalEdges: 2,
    });

    expect(body.nodes.map((node: { id: string }) => node.id)).toEqual([
      "agent-b",
      "agent-a",
      "agent-c",
    ]);

    expect(body.edges).toEqual([
      { source: "agent-a", target: "agent-b", weight: 10, count: 2 },
      { source: "agent-b", target: "agent-c", weight: 4, count: 1 },
    ]);

    const nodeB = body.nodes.find((node: { id: string }) => node.id === "agent-b");
    expect(nodeB.interactionWeight).toBe(14);
    expect(nodeB.interactionCount).toBe(3);
  });

  it("normalizes invalid windowDays and clamps maxNodes", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ platformId: "moltbook" }]))
      .mockReturnValueOnce(chainableWith([]));

    const res = await GET(makeRequest({ windowDays: "999", maxNodes: "999" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.meta.windowDays).toBe(30);
    expect(body.meta.maxNodes).toBe(120);
  });
});
