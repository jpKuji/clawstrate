// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NetworkGraph } from "@/components/dashboard/NetworkGraph";
import type { NetworkGraphEdge, NetworkGraphNode } from "@/lib/network/types";

const baseNodes: NetworkGraphNode[] = [
  {
    id: "agent-a",
    displayName: "Agent A",
    influenceScore: 0.8,
    autonomyScore: 0.7,
    activityScore: 0.5,
    agentType: "content_creator",
    communityLabel: 1,
    interactionWeight: 8,
    interactionCount: 3,
  },
  {
    id: "agent-b",
    displayName: "Agent B",
    influenceScore: 0.6,
    autonomyScore: 0.4,
    activityScore: 0.4,
    agentType: "commenter",
    communityLabel: 2,
    interactionWeight: 7,
    interactionCount: 2,
  },
];

const baseEdges: NetworkGraphEdge[] = [
  {
    source: "agent-a",
    target: "agent-b",
    weight: 3,
    count: 2,
  },
];

describe("NetworkGraph", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("renders an explicit empty state when graph data is missing", () => {
    render(<NetworkGraph nodes={[]} edges={[]} colorMode="auto" />);

    expect(
      screen.getByText("No interaction network available for this filter window")
    ).toBeInTheDocument();
  });

  it("uses agent type color mode automatically when type diversity exists", () => {
    render(<NetworkGraph nodes={baseNodes} edges={baseEdges} colorMode="auto" />);

    expect(screen.getByText("Color key (agentType)")).toBeInTheDocument();
    expect(screen.getByText("content creator")).toBeInTheDocument();
    expect(screen.getByText("commenter")).toBeInTheDocument();
  });

  it("renders community legend when community color mode is requested", () => {
    render(<NetworkGraph nodes={baseNodes} edges={baseEdges} colorMode="community" />);

    expect(screen.getByText("Color key (community)")).toBeInTheDocument();
    expect(screen.getByText(/community 1/i)).toBeInTheDocument();
    expect(screen.getByText(/community 2/i)).toBeInTheDocument();
  });
});
