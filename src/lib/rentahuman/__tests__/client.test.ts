import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers({ "content-type": "application/json", ...(headers || {}) }),
  } as unknown as Response;
}

describe("RentAHumanClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.resetModules();
  });

  it("constructs correct URLs for listBounties with query params", async () => {
    const { getRentAHumanClient } = await import("../client");
    const client = getRentAHumanClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, bounties: [] }));

    await client.listBounties({ limit: 10, cursor: "c1", status: "open" });
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("https://rentahuman.ai/api/bounties?");
    expect(String(url)).toContain("limit=10");
    expect(String(url)).toContain("cursor=c1");
    expect(String(url)).toContain("status=open");
  });

  it("throws on success:false JSON responses", async () => {
    const { getRentAHumanClient } = await import("../client");
    const client = getRentAHumanClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: "nope" }, 200));

    await expect(client.listBounties({ limit: 1 })).rejects.toThrow("RentAHuman API error");
  });

  it("throws on non-OK response and includes status", async () => {
    const { getRentAHumanClient } = await import("../client");
    const client = getRentAHumanClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Not Found" }, 404));

    await expect(client.getBounty("missing")).rejects.toThrow("RentAHuman API 404");
  });
});
