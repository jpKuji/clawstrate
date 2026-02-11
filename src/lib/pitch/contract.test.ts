import { describe, expect, it } from "vitest";
import { buildPitchContractFiles } from "@/lib/pitch/contract";

describe("pitch contract generation", () => {
  it("generates all required files", () => {
    const files = buildPitchContractFiles();

    const required = [
      "pitch.md",
      "faq.md",
      "transcript.md",
      "llms.txt",
      "llms-full.txt",
      "skill.md",
      ".well-known/skills/index.json",
      ".well-known/skills/default/skill.md",
    ];

    for (const file of required) {
      expect(files[file]).toBeDefined();
      expect(files[file].length).toBeGreaterThan(0);
    }
  });

  it("uses only /pitch-prefixed canonical links", () => {
    const files = buildPitchContractFiles();

    expect(files["pitch.md"]).toContain('human: "/pitch"');
    expect(files["pitch.md"]).toContain('agent: "/pitch/agent"');
    expect(files["llms.txt"]).toContain("[/pitch/pitch.md]");
    expect(files["llms.txt"]).toContain("[/pitch/transcript.md]");
  });

  it("keeps pitch markdown below 200KB", () => {
    const files = buildPitchContractFiles();
    const size = Buffer.byteLength(files["pitch.md"], "utf8");

    expect(size).toBeLessThan(200 * 1024);
  });
});
