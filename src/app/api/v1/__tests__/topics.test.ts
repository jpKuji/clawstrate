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

  it("respects limit parameter with default of 50", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest());

    const call = mockDb.query.topics.findMany.mock.calls[0][0];
    expect(call.limit).toBe(50);
  });

  it("respects custom limit parameter", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ limit: "15" }));

    const call = mockDb.query.topics.findMany.mock.calls[0][0];
    expect(call.limit).toBe(15);
  });

  it("caps limit at 100", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([]);

    await listTopics(makeListRequest({ limit: "200" }));

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
    mockDb.select.mockReturnValueOnce(chainableWith(topicActions));

    const req = makeDetailRequest(mockDbTopic.slug);
    const res = await getTopic(req, {
      params: Promise.resolve({ slug: mockDbTopic.slug }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.topic.id).toBe(mockDbTopic.id);
    expect(body.topic.slug).toBe(mockDbTopic.slug);
    expect(body.recentActions).toHaveLength(1);
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
});
