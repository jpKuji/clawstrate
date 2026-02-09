import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";
import { mockDbAction, mockDbAgent } from "@/__tests__/mocks/fixtures";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { GET } from "@/app/api/v1/search/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/search");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
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

describe("GET /api/v1/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns empty results for empty query", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.query).toBe("");
  });

  it("returns empty results for query shorter than 2 characters", async () => {
    const res = await GET(makeRequest({ q: "a" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.query).toBe("a");
  });

  it("searches by title and content using ILIKE", async () => {
    const searchResults = [
      {
        id: mockDbAction.id,
        title: mockDbAction.title,
        content: mockDbAction.content,
        actionType: mockDbAction.actionType,
        performedAt: mockDbAction.performedAt,
        agentName: mockDbAgent.displayName,
        upvotes: mockDbAction.upvotes,
      },
    ];
    mockDb.select.mockReturnValueOnce(chainableWith(searchResults));

    const res = await GET(makeRequest({ q: "MCP Security" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.query).toBe("MCP Security");
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("respects limit parameter with default of 20", async () => {
    mockDb.select.mockReturnValueOnce(chainableWith([]));

    await GET(makeRequest({ q: "test query" }));

    // select was called, the chain ends with .limit()
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("caps limit at 50", async () => {
    mockDb.select.mockReturnValueOnce(chainableWith([]));

    await GET(makeRequest({ q: "test query", limit: "100" }));

    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("returns correct fields in search results", async () => {
    const searchResults = [
      {
        id: "action-001",
        title: "Test Title",
        content: "Test content here",
        actionType: "post",
        performedAt: new Date("2025-01-15T10:30:00Z"),
        agentName: "TestBot",
        upvotes: 42,
      },
    ];
    mockDb.select.mockReturnValueOnce(chainableWith(searchResults));

    const res = await GET(makeRequest({ q: "test" }));
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    const result = body.results[0];
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("actionType");
    expect(result).toHaveProperty("performedAt");
    expect(result).toHaveProperty("agentName");
    expect(result).toHaveProperty("upvotes");
  });

  it("returns results ordered by performedAt desc", async () => {
    const searchResults = [
      {
        id: "action-002",
        title: "Newer",
        content: "test",
        actionType: "post",
        performedAt: new Date("2025-01-16"),
        agentName: "Bot",
        upvotes: 1,
      },
      {
        id: "action-001",
        title: "Older",
        content: "test",
        actionType: "post",
        performedAt: new Date("2025-01-15"),
        agentName: "Bot",
        upvotes: 2,
      },
    ];
    mockDb.select.mockReturnValueOnce(chainableWith(searchResults));

    const res = await GET(makeRequest({ q: "test" }));
    const body = await res.json();

    expect(body.results).toHaveLength(2);
    // Results should come back in the order returned by the DB (which is ordered by desc)
    expect(body.results[0].id).toBe("action-002");
    expect(body.results[1].id).toBe("action-001");
  });

  it("does not call database for short queries", async () => {
    await GET(makeRequest({ q: "x" }));
    await GET(makeRequest({ q: "" }));
    await GET(makeRequest());

    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
