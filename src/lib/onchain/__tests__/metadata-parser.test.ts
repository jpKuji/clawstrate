import { afterEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
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

  it("parses gzip-compressed data URI metadata payload", async () => {
    const payload = {
      name: "Compressed Agent",
      description: "from data uri",
      protocols: ["A2A"],
      x402_supported: false,
      serviceEndpoints: { mcp: "https://agent.example/mcp" },
    };
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64");
    const uri = `data:application/json;enc=gzip;base64,${compressed}`;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await parseAgentMetadataFromUri(uri);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.parseStatus).toBe("success");
    expect(result.name).toBe("Compressed Agent");
    expect(result.protocols).toEqual(["A2A"]);
    expect(result.x402Supported).toBe(false);
  });
});
