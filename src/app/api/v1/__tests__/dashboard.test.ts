import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";
import { mockDbNarrative, mockDbAgent, mockDbTopic } from "@/__tests__/mocks/fixtures";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

// Must import after mock setup
import { GET } from "@/app/api/v1/dashboard/route";

describe("GET /api/v1/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns correct JSON structure with all expected keys", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty("metrics");
    expect(body).toHaveProperty("latestBriefing");
    expect(body).toHaveProperty("topTopics");
    expect(body).toHaveProperty("topAgents");
  });

  it("returns metrics with all required fields", async () => {
    // Set up the select mock to return different values for each call
    // The route calls: totalActions, totalAgents, recentActions, networkStats
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 150 }]))   // totalActions
      .mockReturnValueOnce(chainableWith([{ count: 28 }]))    // totalAgents
      .mockReturnValueOnce(chainableWith([{ count: 45 }]))    // recentActions
      // networkStats is the 4th select call — but actually it's called via Promise.all
      // We need a 4th mock for enrichments avg
      .mockReturnValueOnce(
        chainableWith([{ avgAutonomy: 0.6543, avgSentiment: 0.4217 }])
      );

    // latestBriefing
    mockDb.query.narratives.findFirst.mockResolvedValueOnce(mockDbNarrative);
    // topTopics
    mockDb.query.topics.findMany.mockResolvedValueOnce([mockDbTopic]);
    // topAgents
    mockDb.query.agents.findMany.mockResolvedValueOnce([mockDbAgent]);

    const res = await GET();
    const body = await res.json();

    expect(body.metrics.totalActions).toBe(150);
    expect(body.metrics.totalAgents).toBe(28);
    expect(body.metrics.actionsLast24h).toBe(45);
    expect(body.metrics).toHaveProperty("networkAutonomy");
    expect(body.metrics).toHaveProperty("networkSentiment");
  });

  it("formats networkAutonomy and networkSentiment to 2 decimal places", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(
        chainableWith([{ avgAutonomy: 0.6549, avgSentiment: 0.4217 }])
      );

    mockDb.query.narratives.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();

    expect(body.metrics.networkAutonomy).toBe("0.65");
    expect(body.metrics.networkSentiment).toBe("0.42");
  });

  it("returns latestBriefing object with correct fields", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ avgAutonomy: 0, avgSentiment: 0 }]));

    mockDb.query.narratives.findFirst.mockResolvedValueOnce(mockDbNarrative);
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();

    expect(body.latestBriefing).not.toBeNull();
    expect(body.latestBriefing.id).toBe(mockDbNarrative.id);
    expect(body.latestBriefing.title).toBe(mockDbNarrative.title);
    expect(body.latestBriefing.summary).toBe(mockDbNarrative.summary);
    expect(body.latestBriefing).toHaveProperty("generatedAt");
  });

  it("returns null for latestBriefing when no narratives exist", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ avgAutonomy: 0, avgSentiment: 0 }]));

    mockDb.query.narratives.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();

    expect(body.latestBriefing).toBeNull();
  });

  it("returns topTopics array (max 5)", async () => {
    const fiveTopics = Array.from({ length: 5 }, (_, i) => ({
      ...mockDbTopic,
      id: `topic-uuid-${i}`,
      slug: `topic-${i}`,
      name: `Topic ${i}`,
    }));

    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ avgAutonomy: 0, avgSentiment: 0 }]));

    mockDb.query.narratives.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topics.findMany.mockResolvedValueOnce(fiveTopics);
    mockDb.query.agents.findMany.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();

    expect(body.topTopics).toHaveLength(5);
  });

  it("returns topAgents array with mapped fields", async () => {
    mockDb.select
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ count: 0 }]))
      .mockReturnValueOnce(chainableWith([{ avgAutonomy: 0, avgSentiment: 0 }]));

    mockDb.query.narratives.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);
    mockDb.query.agents.findMany.mockResolvedValueOnce([mockDbAgent]);

    const res = await GET();
    const body = await res.json();

    expect(body.topAgents).toHaveLength(1);
    const agent = body.topAgents[0];
    expect(agent.id).toBe(mockDbAgent.id);
    expect(agent.displayName).toBe(mockDbAgent.displayName);
    expect(agent.influenceScore).toBe(mockDbAgent.influenceScore);
    expect(agent.autonomyScore).toBe(mockDbAgent.autonomyScore);
    expect(agent.agentType).toBe(mockDbAgent.agentType);
    // Should NOT include extra fields
    expect(agent).not.toHaveProperty("activityScore");
    expect(agent).not.toHaveProperty("totalActions");
  });
});

// Helper: create a chainable mock that resolves to a given value
function chainableWith(terminal: unknown) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(terminal);
        }
        if (prop === "from") return () => chain;
        if (prop === "where") return () => chain;
        if (prop === "innerJoin") return () => chain;
        if (prop === "leftJoin") return () => chain;
        if (prop === "orderBy") return () => chain;
        if (prop === "limit") return () => chain;
        if (prop === "groupBy") return () => chain;
        return () => chain;
      },
    }
  );
  return chain;
}
