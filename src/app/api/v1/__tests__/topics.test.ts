import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";
import { mockDbTopic, mockDbAction, mockDbAgent } from "@/__tests__/mocks/fixtures";

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

import { GET as listTopics } from "@/app/api/v1/topics/route";
import { GET as getTopic } from "@/app/api/v1/topics/[slug]/route";

function makeListRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/topics");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
}

function makeDetailRequest(slug: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/topics/${slug}`);
}

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

describe("GET /api/v1/topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns list of topics with default sort (velocity desc)", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([mockDbTopic]);

    const res = await listTopics(makeListRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(mockDb.query.topics.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: velocity", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ sort: "velocity" }));

    expect(mockDb.query.topics.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: actions", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ sort: "actions" }));

    expect(mockDb.query.topics.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: agents", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ sort: "agents" }));

    expect(mockDb.query.topics.findMany).toHaveBeenCalledOnce();
  });

  it("supports sort parameter: recent", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ sort: "recent" }));

    expect(mockDb.query.topics.findMany).toHaveBeenCalledOnce();
  });

  it("returns onchain-derived topics for source=onchain", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          topic_slug: "agent-registration",
          topic_name: "Agent Registration",
          velocity: 0.8,
          action_count: 20,
          agent_count: 7,
          last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });

    const res = await listTopics(makeListRequest({ source: "onchain" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("onchain:agent-registration");
    expect(body[0].slug).toBe("agent-registration");
  });

  it("falls back to canonical topics when onchain query fails", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([mockDbTopic]);
    mockDb.execute.mockRejectedValueOnce(new Error("relation onchain_event_topics does not exist"));

    const res = await listTopics(makeListRequest({ source: "all" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(mockDbTopic.id);
  });

  it("falls back to unfiltered topics when source filter query fails", async () => {
    mockDb.query.topics.findMany
      .mockRejectedValueOnce(new Error("column actions.platform_id does not exist"))
      .mockResolvedValueOnce([mockDbTopic]);

    const res = await listTopics(makeListRequest({ source: "moltbook" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(mockDb.query.topics.findMany).toHaveBeenCalledTimes(2);
  });

  it("merges canonical + onchain topics for source=all", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([
      {
        ...mockDbTopic,
        slug: "agent-registration",
        name: "Agent Registration",
        actionCount: 5,
        agentCount: 2,
        velocity: 0.2,
      },
    ]);
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          topic_slug: "agent-registration",
          topic_name: "Agent Registration",
          velocity: 0.8,
          action_count: 20,
          agent_count: 7,
          last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });

    const res = await listTopics(makeListRequest({ source: "all" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].slug).toBe("agent-registration");
    expect(body[0].actionCount).toBe(25);
  });

  it("respects limit parameter with default of 50", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ source: "moltbook" }));

    const call = mockDb.query.topics.findMany.mock.calls[0][0];
    expect(call.limit).toBe(50);
  });

  it("respects custom limit parameter", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ source: "moltbook", limit: "15" }));

    const call = mockDb.query.topics.findMany.mock.calls[0][0];
    expect(call.limit).toBe(15);
  });

  it("caps limit at 100", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ source: "moltbook", limit: "200" }));

    const call = mockDb.query.topics.findMany.mock.calls[0][0];
    expect(call.limit).toBe(100);
  });
});

describe("GET /api/v1/topics/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns topic detail with recent actions", async () => {
    mockDb.query.topics.findFirst.mockResolvedValueOnce(mockDbTopic);

    const topicActions = [
      {
        action: mockDbAction,
        agentName: mockDbAgent.displayName,
        autonomyScore: 0.85,
        sentiment: 0.6,
      },
    ];
    const cooccurring = [
      { relatedTopicId: "topic-uuid-002", cooccurrenceCount: 3 },
    ];
    const topContributors = [
      { agentId: mockDbAgent.id, agentName: mockDbAgent.displayName, actionCount: 5 },
    ];

    mockDb.select
      .mockReturnValueOnce(chainableWith(topicActions))
      .mockReturnValueOnce(chainableWith(cooccurring))
      .mockReturnValueOnce(chainableWith(topContributors));

    mockDb.query.topics.findMany.mockResolvedValueOnce([
      {
        ...mockDbTopic,
        id: "topic-uuid-002",
        slug: "related-topic",
        name: "Related Topic",
      },
    ]);

    const req = makeDetailRequest(mockDbTopic.slug);
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: mockDbTopic.slug }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.topic.id).toBe(mockDbTopic.id);
    expect(body.topic.slug).toBe(mockDbTopic.slug);
    expect(body.recentActions).toHaveLength(1);
    expect(body.isAlias).toBe(false);
    expect(body.canonicalSlug).toBe(mockDbTopic.slug);
  });

  it("returns 404 when topic slug is not found", async () => {
    mockDb.query.topics.findFirst.mockResolvedValueOnce(null);

    const req = makeDetailRequest("nonexistent-slug");
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: "nonexistent-slug" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("resolves topic alias slugs to canonical topic", async () => {
    mockDb.query.topics.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockDbTopic);

    mockDb.query.topicAliases.findFirst.mockResolvedValueOnce({
      aliasSlug: "old-slug",
      topicId: mockDbTopic.id,
      createdAt: new Date(),
    });

    mockDb.select
      .mockReturnValueOnce(chainableWith([]))
      .mockReturnValueOnce(chainableWith([]))
      .mockReturnValueOnce(chainableWith([]));

    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    const req = makeDetailRequest("old-slug");
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: "old-slug" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isAlias).toBe(true);
    expect(body.requestedSlug).toBe("old-slug");
    expect(body.canonicalSlug).toBe(mockDbTopic.slug);
  });

  it("returns JSON 500 on unexpected errors", async () => {
    mockDb.query.topics.findFirst.mockRejectedValueOnce(new Error("boom"));

    const req = makeDetailRequest(mockDbTopic.slug);
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: mockDbTopic.slug }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal Server Error");
  });

  it("returns onchain-only topic detail when canonical topic is missing", async () => {
    mockDb.query.topics.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topicAliases.findFirst.mockResolvedValueOnce(null);

    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            topic_name: "Agent Registration",
            action_count: 12,
            agent_count: 4,
            velocity: 0.5,
            last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            chain_id: 1,
            tx_hash: "0xtx",
            log_index: 0,
            block_time: new Date("2026-01-03T00:00:00.000Z"),
            standard: "erc8004",
            event_name: "Registered",
            agent_keys: ["1:0xregistry:42"],
            agent_names: ["Onchain Agent"],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            agent_key: "1:0xregistry:42",
            agent_name: "Onchain Agent",
            action_count: 6,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ slug: "protocol-identity-layer", name: "Protocol Identity Layer", count: 5 }],
      });

    const req = makeDetailRequest("agent-registration");
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: "agent-registration" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.topic.id).toBe("onchain:agent-registration");
    expect(body.recentActions[0].agentId).toBe("onchain:1:0xregistry:42");
  });
});
