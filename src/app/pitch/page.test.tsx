// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

const mockPitch = {
  project_slug: "clawstrate",
  version: "0.1",
  last_updated: "2026-02-11",
  title: "Clawstrate",
  tagline: "The Bloomberg Terminal for the Agent Economy",
  one_liner: "One-liner",
  icp: "ICP",
  outcome: "Outcome",
  hero_bullets: ["Bullet 1", "Bullet 2"],
  problem: ["Problem"],
  solution: ["Solution"],
  why_now: ["Why now"],
  product: ["Product"],
  business_model: ["Business"],
  competition: ["Competition"],
  moat: ["Moat"],
  traction: {
    stage: "Prototype",
    metrics: ["Metric"],
    proof_points: ["Proof"],
  },
  team: [
    {
      name: "Julian",
      role: "Founder",
      bio: "Bio",
    },
  ],
  ask: {
    looking_for: ["Ask"],
    use_of_funds: ["Use"],
  },
  links: {
    video: "/pitch/video/pitch.mp4",
    deck: "/pitch/deck.pdf",
    contact: "mailto:test@example.com",
  },
  contact: {
    name: "Julian",
    email: "julian@codecoast.ch",
  },
  company: {
    legal_name: "Company",
    jurisdiction_note: "Note",
  },
};

vi.mock("@/lib/pitch/content", () => ({
  loadPitchContent: () => mockPitch,
}));

vi.mock("@/app/pitch/_components/PitchEffects", () => ({
  PitchEffects: () => null,
}));

import PitchPage from "@/app/pitch/page";

describe("/pitch page", () => {
  it("renders core sections and agent CTA link", () => {
    render(<PitchPage />);

    expect(screen.getByRole("heading", { name: /the bloomberg terminal for the agent economy/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /video pitch/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /the ask/i })).toBeInTheDocument();

    const agentLinks = screen.getAllByRole("link", { name: /open agent surface/i });
    expect(agentLinks.length).toBeGreaterThan(0);
    expect(agentLinks[0]).toHaveAttribute("href", "/pitch/agent");
  });
});
