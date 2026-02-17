import { describe, expect, it } from "vitest";
import { shouldPersist4337Log } from "@/lib/onchain/erc4337-filter";

describe("erc4337 agent filter", () => {
  it("persists a log when sender is a known wallet", () => {
    const knownWallets = new Set(["0x1111111111111111111111111111111111111111"]);
    const shouldPersist = shouldPersist4337Log(
      { sender: "0x1111111111111111111111111111111111111111" },
      knownWallets
    );

    expect(shouldPersist).toBe(true);
  });

  it("skips a log when sender is unknown", () => {
    const knownWallets = new Set(["0x1111111111111111111111111111111111111111"]);
    const shouldPersist = shouldPersist4337Log(
      { sender: "0x2222222222222222222222222222222222222222" },
      knownWallets
    );

    expect(shouldPersist).toBe(false);
  });

  it("skips a log when sender is missing", () => {
    const knownWallets = new Set(["0x1111111111111111111111111111111111111111"]);
    const shouldPersist = shouldPersist4337Log({}, knownWallets);

    expect(shouldPersist).toBe(false);
  });

  it("handles sender case-insensitively", () => {
    const knownWallets = new Set(["0x1111111111111111111111111111111111111111"]);
    const shouldPersist = shouldPersist4337Log(
      { sender: "0x1111111111111111111111111111111111111111".toUpperCase() },
      knownWallets
    );

    expect(shouldPersist).toBe(true);
  });
});
