// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NetworkExplorer } from "@/components/dashboard/NetworkExplorer";
import type { GraphApiResponse } from "@/lib/network/types";

vi.mock("@/components/dashboard/NetworkGraph", () => ({
  NetworkGraph: ({
    nodes,
    edges,
    colorMode,
  }: {
    nodes: Array<{ id: string }>;
    edges: Array<{ source: string; target: string }>;
    colorMode: string;
  }) => (
    <div data-testid="network-graph">
      nodes:{nodes.length};edges:{edges.length};mode:{colorMode}
    </div>
  ),
}));

function createPayload(overrides?: Partial<GraphApiResponse>): GraphApiResponse {
  return {
    nodes: [
      {
        id: "agent-1",
        displayName: "Agent One",
        influenceScore: 0.7,
        autonomyScore: 0.5,
        activityScore: 0.4,
        agentType: "content_creator",
        communityLabel: 1,
        interactionWeight: 12,
        interactionCount: 3,
      },
    ],
    edges: [{ source: "agent-1", target: "agent-2", weight: 4, count: 2 }],
    availableSources: ["all", "moltbook"],
    meta: {
      source: "all",
      windowDays: 30,
      maxNodes: 50,
      totalNodes: 1,
      totalEdges: 1,
    },
    ...overrides,
  };
}

function responseWith(payload: GraphApiResponse): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe("NetworkExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches graph data based on control state and updates color mode locally", async () => {
    const payload = createPayload();
    const fetchMock = vi
      .fn<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(responseWith(payload));

    vi.stubGlobal("fetch", fetchMock);

    render(<NetworkExplorer initialData={payload} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const callsAfterMount = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      callsAfterMount.some(
        (url) =>
          url.includes("source=all") &&
          url.includes("windowDays=30") &&
          url.includes("maxNodes=50")
      )
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "moltbook" },
    });
    fireEvent.change(screen.getByLabelText("Window"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText("Max nodes"), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Color mode"), {
      target: { value: "community" },
    });

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some(
          (url) =>
            url.includes("source=moltbook") &&
            url.includes("windowDays=14") &&
            url.includes("maxNodes=80")
        )
      ).toBe(true);
    });

    expect(screen.getByTestId("network-graph")).toHaveTextContent("mode:community");
  });

  it("shows refresh error and retries on demand", async () => {
    const payload = createPayload();
    const fetchMock = vi
      .fn<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: "unavailable" }),
      } as Response)
      .mockResolvedValueOnce(responseWith(payload));

    vi.stubGlobal("fetch", fetchMock);

    render(<NetworkExplorer initialData={payload} />);

    await waitFor(() => {
      expect(
        screen.getByText("Unable to refresh network data")
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
