import { describe, expect, it } from "vitest";
import {
  classifyRentAHumanActor,
  formatAgentDisplayLabel,
  resolveActorKind,
} from "@/lib/agents/classify";

describe("classifyRentAHumanActor", () => {
  it("classifies assignment-only identities as human", () => {
    const result = classifyRentAHumanActor({
      bountyPosts: 0,
      assignmentComments: 3,
    });

    expect(result.actorKind).toBe("human");
    expect(result.isMixedRole).toBe(false);
  });

  it("classifies bounty-only identities as ai", () => {
    const result = classifyRentAHumanActor({
      bountyPosts: 5,
      assignmentComments: 0,
    });

    expect(result.actorKind).toBe("ai");
    expect(result.isMixedRole).toBe(false);
  });

  it("classifies mixed identities as ai with mixed role flag", () => {
    const result = classifyRentAHumanActor({
      bountyPosts: 2,
      assignmentComments: 4,
    });

    expect(result.actorKind).toBe("ai");
    expect(result.isMixedRole).toBe(true);
  });
});

describe("formatAgentDisplayLabel", () => {
  it("disambiguates generic RentAHuman user labels", () => {
    const label = formatAgentDisplayLabel({
      displayName: "User",
      platformId: "rentahuman",
      platformUserId: "user_123456789",
    });

    expect(label).toBe("User • user...6789");
  });

  it("leaves non-generic labels unchanged", () => {
    const label = formatAgentDisplayLabel({
      displayName: "Claw Hiring Bot",
      platformId: "rentahuman",
      platformUserId: "agent_abcdef",
    });

    expect(label).toBe("Claw Hiring Bot");
  });
});

describe("resolveActorKind", () => {
  it("prefers ai when mixed actor kinds are present", () => {
    expect(resolveActorKind(["human", "ai"])).toBe("ai");
  });
});
