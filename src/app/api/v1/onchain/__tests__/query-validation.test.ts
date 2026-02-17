import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/onchain/quota", () => ({
  enforceOnchainQuota: vi.fn().mockResolvedValue({ ok: true }),
  getAccountIdFromRequest: vi.fn().mockReturnValue("default"),
}));

import { GET as getAgents } from "@/app/api/v1/onchain/agents/route";
import { GET as getEvents } from "@/app/api/v1/onchain/events/route";

describe("onchain API query validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns 400 for invalid chainId in agents route", async () => {
    const req = new NextRequest("http://localhost/api/v1/onchain/agents?chainId=abc");
    const res = await getAgents(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid chainId" });
  });

  it("returns 400 for invalid chainId in events route", async () => {
    const req = new NextRequest("http://localhost/api/v1/onchain/events?chainId=abc");
    const res = await getEvents(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid chainId" });
  });
});
