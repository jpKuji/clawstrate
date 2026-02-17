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
    expect(entrypointStreams.length).toBe(20); // 2 events x 2 entrypoints x 5 chains
    expect(
      entrypointStreams.some(
        (stream) => stream.address === "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789"
      )
    ).toBe(true);
    expect(
      entrypointStreams.some(
        (stream) => stream.address === "0x4337084d9e255ff0702461cf8895ce9e3b5ff108"
      )
    ).toBe(true);

    const sampleScope = streamScope(entrypointStreams[0]);
    expect(sampleScope).toContain("erc4337");
    expect(sampleScope).toContain("UserOperationEvent");
  });
});
