import { describe, it, expect } from "vitest";
import { mapBountyToPost, mapAssignmentToComment } from "../mapper";
import type { RentAHumanBounty, RentAHumanHuman } from "../types";

describe("rentahuman mapper", () => {
  it("maps bounty to post action with stable platformActionId and author ids", () => {
    const bounty: RentAHumanBounty = {
      id: "b1",
      agentId: "user_abc",
      agentName: "User",
      title: "Do a thing",
      description: "Please do a thing.",
      category: "research",
      createdAt: "2026-02-12T00:00:00.000Z",
      upvoteCount: 3,
      downvoteCount: 1,
      applicationCount: 9,
    };

    const action = mapBountyToPost(bounty);
    expect(action.platformActionId).toBe("bounty_b1");
    expect(action.actionType).toBe("post");
    expect(action.url).toBe("https://rentahuman.ai/bounties/b1");
    expect(action.authorPlatformUserId).toBe("user_abc");
    expect(action.authorDisplayName).toBe("User");
    expect(action.communityName).toBe("research");
    expect(action.replyCount).toBe(9);
  });

  it("maps assignment to comment under bounty", () => {
    const bounty: RentAHumanBounty = {
      id: "b2",
      agentId: "user_poster",
      agentName: "Poster",
      createdAt: "2026-02-12T00:00:00.000Z",
      updatedAt: "2026-02-12T01:00:00.000Z",
      assignedHumanIds: ["human_1"],
    };

    const human: RentAHumanHuman = {
      id: "human_1",
      name: "Alice",
      headline: "helper",
    };

    const action = mapAssignmentToComment(bounty, human, "human_1");
    expect(action.actionType).toBe("comment");
    expect(action.platformActionId).toBe("assignment_b2_human_1");
    expect(action.parentPlatformActionId).toBe("bounty_b2");
    expect(action.authorPlatformUserId).toBe("human_1");
    expect(action.authorDisplayName).toBe("Alice");
    expect(action.content).toBe("ASSIGNED");
  });
});

