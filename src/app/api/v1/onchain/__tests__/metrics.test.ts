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

import { GET } from "@/app/api/v1/onchain/metrics/route";

describe("GET /api/v1/onchain/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("returns base totals and erc4337 coverage fields", async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            total_events: 100,
            total_agents: 11,
            total_feedbacks: 8,
            total_validations: 4,
            total_userops: 9,
            total_coordinations: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ events_24h: 10, agents_24h: 3, userops_24h: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { chain_id: 1, count: 2 },
          { chain_id: 10, count: 2 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { chain_id: 1, count: 2 },
          { chain_id: 10, count: 1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ chain_id: 1 }, { chain_id: 10 }],
      });

    const req = new NextRequest("http://localhost/api/v1/onchain/metrics");
    const res = await GET(req);
    const body = await res.json();

    expect(body.totals).toEqual({
      events: 100,
      agents: 11,
      feedbacks: 8,
      validations: 4,
      userOps: 9,
      coordinations: 2,
    });
    expect(body.last24h).toEqual({
      events: 10,
      agents: 3,
      userOps: 4,
    });
    expect(body.erc4337Coverage).toEqual({
      configuredEntryPoints: 4,
      seenEntryPoints24h: 3,
      configuredByChain: { "1": 2, "10": 2 },
      seenByChain24h: { "1": 2, "10": 1 },
      isDualEntryPointConfigured: true,
    });
  });
});
