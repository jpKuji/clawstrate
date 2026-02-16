import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAgentMetadataFromUri } from "@/lib/onchain/metadata-parser";

describe("metadata parser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses successful metadata payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          name: "Agent X",
          description: "test agent",
          protocols: ["A2A", "MCP"],
          x402Supported: true,
          endpoints: { a2a: "https://agent.example/a2a" },
        }),
      }))
    );

    const result = await parseAgentMetadataFromUri("https://example.com/agent.json");

    expect(result.parseStatus).toBe("success");
    expect(result.name).toBe("Agent X");
    expect(result.protocols).toEqual(["A2A", "MCP"]);
    expect(result.x402Supported).toBe(true);
  });

  it("returns error status when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
      }))
    );

    const result = await parseAgentMetadataFromUri("https://example.com/agent.json");

    expect(result.parseStatus).toBe("error");
    expect(result.name).toBeNull();
  });
});
