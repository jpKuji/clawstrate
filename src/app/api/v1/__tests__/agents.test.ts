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

import { GET as listAgents } from "@/app/api/v1/agents/route";
import { GET as getAgent } from "@/app/api/v1/agents/[id]/route";

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

    const res = await listAgents(makeListRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
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

  it("returns agent detail with identities, recent actions, and profile history", async () => {
    const agentWithIdentities = { ...mockDbAgent, identities: [mockDbIdentity] };
    mockDb.query.agents.findFirst.mockResolvedValueOnce(agentWithIdentities);

    const recentActions = [{ ...mockDbAction, enrichment: null }];
    mockDb.query.actions.findMany.mockResolvedValueOnce(recentActions);

    const profileHistory = [
      { id: "profile-1", agentId: mockDbAgent.id, snapshotAt: new Date() },
    ];
    mockDb.query.agentProfiles.findMany.mockResolvedValueOnce(profileHistory);

    const req = makeDetailRequest(mockDbAgent.id);
    const res = await getAgent(req, { params: Promise.resolve({ id: mockDbAgent.id }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agent.id).toBe(mockDbAgent.id);
    expect(body.agent.identities).toHaveLength(1);
    expect(body.recentActions).toHaveLength(1);
    expect(body.profileHistory).toHaveLength(1);
  });

  it("returns 404 when agent id is not found", async () => {
    mockDb.query.agents.findFirst.mockResolvedValueOnce(null);

    const req = makeDetailRequest("nonexistent-id");
    const res = await getAgent(req, { params: Promise.resolve({ id: "nonexistent-id" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});
