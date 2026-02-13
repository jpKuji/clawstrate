import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";
import { mockDbAgent, mockDbIdentity, mockDbAction } from "@/__tests__/mocks/fixtures";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

import { GET as listAgents } from "@/app/api/v1/agents/route";
import { GET as getAgent } from "@/app/api/v1/agents/[id]/route";

function chainableSelect(resolveData: any[]) {
  const chain: any = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") return (resolve: any) => resolve(resolveData);
        return () => chain;
      },
    }
  );
  return chain;
}

function makeListRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/agents");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
}

function makeDetailRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/agents/${id}`);
}

describe("GET /api/v1/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns list of agents with default sort (influence desc)", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([mockDbAgent]);
    mockDb.select.mockImplementationOnce(() =>
      chainableSelect([
        {
          agentId: mockDbAgent.id,
          platformId: "moltbook",
          platformUserId: "SecurityBot",
          platformUsername: "SecurityBot",
          rawProfile: { actorKind: "ai" },
        },
      ])
    );

    const res = await listAgents(makeListRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].actorKind).toBe("ai");
    expect(body[0].sourceProfileType).toBe("forum_ai");
    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports actor=all for debug/admin views", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    const res = await listAgents(makeListRequest({ actor: "all" }));
    expect(res.status).toBe(200);
    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: influence", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ sort: "influence" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: autonomy", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ sort: "autonomy" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: activity", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ sort: "activity" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: recent", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ sort: "recent" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: actions", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ sort: "actions" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports order parameter: asc", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ order: "asc" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("supports order parameter: desc", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ order: "desc" }));

    expect(mockDb.query.agents.findMany).toHaveBeenCalledOnce();
  });

  it("respects limit parameter with default of 50", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest());

    const call = mockDb.query.agents.findMany.mock.calls[0][0];
    expect(call.limit).toBe(50);
  });

  it("respects custom limit parameter", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ limit: "25" }));

    const call = mockDb.query.agents.findMany.mock.calls[0][0];
    expect(call.limit).toBe(25);
  });

  it("caps limit at 100", async () => {
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    await listAgents(makeListRequest({ limit: "500" }));

    const call = mockDb.query.agents.findMany.mock.calls[0][0];
    expect(call.limit).toBe(100);
  });
});

describe("GET /api/v1/agents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns marketplace profile for RentAHuman AI agents", async () => {
    const agentWithIdentities = {
      ...mockDbAgent,
      identities: [
        {
          ...mockDbIdentity,
          platformId: "rentahuman",
          platformUserId: "user_123456",
          rawProfile: { actorKind: "ai" },
        },
      ],
    };
    mockDb.query.agents.findFirst.mockResolvedValueOnce(agentWithIdentities);
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            bounties_posted: 4,
            total_applications_received: 19,
            posts_30d: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ unique_contributors: 6, bounties_with_assignments: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ median_price: 125 }],
      })
      .mockResolvedValueOnce({
        rows: [{ category: "Research", count: 2 }],
      });
    mockDb.query.actions.findMany.mockResolvedValueOnce([
      { ...mockDbAction, rawData: { category: "Research", price: 100 } },
    ]);

    const req = makeDetailRequest(mockDbAgent.id);
    const res = await getAgent(req, { params: Promise.resolve({ id: mockDbAgent.id }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileVariant).toBe("marketplace_ai");
    expect(body.agent.id).toBe(mockDbAgent.id);
    expect(body.marketplaceMetrics.bountiesPosted).toBe(4);
    expect(body.marketplaceMetrics.uniqueContributors).toBe(6);
    expect(body.recentActions).toHaveLength(1);
  });

  it("returns 404 when agent id is not found", async () => {
    mockDb.query.agents.findFirst.mockResolvedValueOnce(null);

    const req = makeDetailRequest("nonexistent-id");
    const res = await getAgent(req, { params: Promise.resolve({ id: "nonexistent-id" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for human-only identities on AI pages", async () => {
    const humanIdentityAgent = {
      ...mockDbAgent,
      identities: [{ ...mockDbIdentity, rawProfile: { actorKind: "human" } }],
    };
    mockDb.query.agents.findFirst.mockResolvedValueOnce(humanIdentityAgent);

    const req = makeDetailRequest(mockDbAgent.id);
    const res = await getAgent(req, { params: Promise.resolve({ id: mockDbAgent.id }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});
