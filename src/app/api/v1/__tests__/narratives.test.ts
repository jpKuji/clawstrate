import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";
import { mockDbNarrative } from "@/__tests__/mocks/fixtures";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { GET } from "@/app/api/v1/narratives/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/narratives");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
}

describe("GET /api/v1/narratives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns list of narratives ordered by generatedAt desc", async () => {
    const narratives = [
      { ...mockDbNarrative, id: "n1", generatedAt: new Date("2025-01-15") },
      { ...mockDbNarrative, id: "n2", generatedAt: new Date("2025-01-14") },
    ];
    mockDb.query.narratives.findMany.mockResolvedValueOnce(narratives);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(mockDb.query.narratives.findMany).toHaveBeenCalledOnce();
  });

  it("respects limit parameter with default of 20", async () => {
    mockDb.query.narratives.findMany.mockResolvedValueOnce([]);

    await GET(makeRequest());

    const call = mockDb.query.narratives.findMany.mock.calls[0][0];
    expect(call.limit).toBe(20);
  });

  it("respects custom limit parameter", async () => {
    mockDb.query.narratives.findMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ limit: "10" }));

    const call = mockDb.query.narratives.findMany.mock.calls[0][0];
    expect(call.limit).toBe(10);
  });

  it("caps limit at 50", async () => {
    mockDb.query.narratives.findMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ limit: "100" }));

    const call = mockDb.query.narratives.findMany.mock.calls[0][0];
    expect(call.limit).toBe(50);
  });

  it("returns single narrative when id parameter is provided", async () => {
    mockDb.query.narratives.findFirst.mockResolvedValueOnce(mockDbNarrative);

    const res = await GET(makeRequest({ id: mockDbNarrative.id }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(mockDbNarrative.id);
    expect(mockDb.query.narratives.findFirst).toHaveBeenCalledOnce();
  });

  it("returns 404 when narrative id is not found", async () => {
    mockDb.query.narratives.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeRequest({ id: "nonexistent" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("handles empty results", async () => {
    mockDb.query.narratives.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});
