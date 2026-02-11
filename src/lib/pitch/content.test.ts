import { describe, expect, it } from "vitest";
import { loadPitchContent, readPitchMarkdown } from "@/lib/pitch/content";

describe("pitch content loader", () => {
  it("loads and validates pitch yaml", () => {
    const pitch = loadPitchContent();

    expect(pitch.title).toBe("Clawstrate");
    expect(pitch.tagline.length).toBeGreaterThan(0);
    expect(pitch.problem.length).toBeGreaterThan(0);
    expect(pitch.solution.length).toBeGreaterThan(0);
  });

  it("normalizes media links to the /pitch namespace", () => {
    const pitch = loadPitchContent();

    expect(pitch.links.video).toMatch(/^\/pitch\//);
    expect(pitch.links.deck).toMatch(/^\/pitch\//);
  });

  it("reads markdown source files", () => {
    const faq = readPitchMarkdown("faq.md");
    const transcript = readPitchMarkdown("transcript.md");

    expect(faq).toContain("# FAQ");
    expect(transcript).toContain("# Transcript");
  });
});
