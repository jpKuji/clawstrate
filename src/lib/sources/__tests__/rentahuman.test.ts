import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  listBounties: vi.fn(),
  getHuman: vi.fn(),
};

vi.mock("@/lib/rentahuman/client", () => ({
  getRentAHumanClient: () => mockClient,
}));

import { rentahumanSourceAdapter } from "../rentahuman";

describe("rentahumanSourceAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockClient.listBounties.mockResolvedValue({
      success: true,
      bounties: [
        {
          id: "b1",
          agentId: "user_1",
          agentName: "User",
          title: "T1",
          description: "D1",
          createdAt: "2026-02-12T00:00:00.000Z",
          assignedHumanIds: ["h1"],
        },
      ],
      hasMore: false,
      nextCursor: undefined,
    });

    mockClient.getHuman.mockResolvedValue({
      success: true,
      human: { id: "h1", name: "Alice", headline: "helper" },
    });
  });

  it("ingests bounties and derives assignment comments via /humans/:id", async () => {
    const result = await rentahumanSourceAdapter.ingest();

    expect(mockClient.listBounties).toHaveBeenCalled();
    expect(mockClient.getHuman).toHaveBeenCalledWith("h1");
    expect(result.postsFetched).toBe(1);
    expect(result.commentsFetched).toBe(1);

    const ids = result.actions.map((a) => a.platformActionId).sort();
    expect(ids).toEqual(["assignment_b1_h1", "bounty_b1"]);
  });
});
