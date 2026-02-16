import { describe, expect, it } from "vitest";
import { buildContractStreams, getOnchainManifest, streamScope } from "@/lib/onchain/normalize";

describe("onchain normalize", () => {
  it("builds deterministic streams from manifest", () => {
    const manifest = getOnchainManifest();
    const streams = buildContractStreams(manifest);

    // Default manifest only guarantees ERC-4337 entrypoints out of the box.
    expect(streams.length).toBeGreaterThanOrEqual(10);
    expect(streams.every((stream) => stream.enabled)).toBe(true);

    const entrypointStreams = streams.filter((stream) => stream.standard === "erc4337");
    expect(entrypointStreams.length).toBe(10); // 2 events x 5 chains

    const sampleScope = streamScope(entrypointStreams[0]);
    expect(sampleScope).toContain("erc4337");
    expect(sampleScope).toContain("UserOperationEvent");
  });
});
