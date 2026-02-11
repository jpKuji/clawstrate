// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MethodologyPage, { MethodologySourcesSection } from "@/app/methodology/page";
import type { MethodologySourceView } from "@/lib/methodology/types";

describe("Methodology page rendering", () => {
  it("renders global sections and enabled source tab content", () => {
    render(<MethodologyPage />);

    expect(screen.getByText("Global Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Current Runtime Cadence")).toBeInTheDocument();
    expect(screen.getByText("Lookback Windows")).toBeInTheDocument();
    expect(screen.getByText("Source Methodology")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Moltbook" })).toBeInTheDocument();
    expect(screen.getAllByText(/comment_count > 0/i).length).toBeGreaterThan(0);
  });

  it("renders fallback state when no enabled sources are provided", () => {
    render(<MethodologySourcesSection sources={[]} />);

    expect(
      screen.getByText(/No enabled source adapters are currently configured/i)
    ).toBeInTheDocument();
  });

  it("renders one tab trigger per provided source", () => {
    const mockSources: MethodologySourceView[] = [
      {
        id: "moltbook",
        displayName: "Moltbook",
        status: "active",
        coverageSummary: "coverage",
        ingestionBehavior: ["behavior"],
        identityModel: "identity",
        knownLimitations: ["limit"],
        sourceSpecificMetrics: [{ label: "Metric", value: "Value" }],
        isEnabled: true,
      },
      {
        id: "synthetic-lab",
        displayName: "Synthetic Lab",
        status: "beta",
        coverageSummary: "coverage",
        ingestionBehavior: ["behavior"],
        identityModel: "identity",
        knownLimitations: ["limit"],
        sourceSpecificMetrics: [{ label: "Metric", value: "Value" }],
        isEnabled: true,
      },
    ];

    render(<MethodologySourcesSection sources={mockSources} />);

    expect(screen.getByRole("tab", { name: "Moltbook" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Synthetic Lab" })
    ).toBeInTheDocument();
  });
});
