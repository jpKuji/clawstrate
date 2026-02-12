import { describe, expect, it } from "vitest";
import { normalizeTopicNameKey, slugifyTopicName } from "../normalize";

describe("normalizeTopicNameKey", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeTopicNameKey("  MBC-20   Token Protocol  ")).toBe(
      "mbc-20 token protocol"
    );
  });
});

describe("slugifyTopicName", () => {
  it("slugifies to lowercase hyphenated", () => {
    expect(slugifyTopicName("MBC-20 Token Protocol")).toBe("mbc-20-token-protocol");
  });

  it("returns a fallback slug for empty input", () => {
    expect(slugifyTopicName("   ")).toBe("topic");
  });
});

