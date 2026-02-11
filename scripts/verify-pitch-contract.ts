import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const publicPitchDir = path.join(cwd, "public", "pitch");

const requiredPublicFiles = [
  "llms.txt",
  "llms-full.txt",
  "pitch.md",
  "faq.md",
  "transcript.md",
  "skill.md",
  ".well-known/skills/index.json",
  ".well-known/skills/default/skill.md",
  "transcript/pitch.vtt",
  "video/pitch.mp4",
  "deck.pdf",
  "favicon.svg",
];

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readPublicFile(file: string): string {
  const fullPath = path.join(publicPitchDir, file);
  assert(fs.existsSync(fullPath), `Missing required file: /public/pitch/${file}`);
  return fs.readFileSync(fullPath, "utf8");
}

for (const file of requiredPublicFiles) {
  const fullPath = path.join(publicPitchDir, file);
  assert(fs.existsSync(fullPath), `Missing required file: /public/pitch/${file}`);
}

const llms = readPublicFile("llms.txt");
const linkMatches = [...llms.matchAll(/\[(\/[^\]\s]+)\]/g)].map((match) => match[1]);
for (const href of linkMatches) {
  if (!href.startsWith("/pitch/")) {
    continue;
  }

  const normalized = href.slice("/pitch/".length);
  const fullPath = path.join(publicPitchDir, normalized);
  assert(fs.existsSync(fullPath), `llms.txt link target missing: ${href}`);
}

const pitchMd = readPublicFile("pitch.md");
const pitchSize = Buffer.byteLength(pitchMd, "utf8");
assert(pitchSize < 200 * 1024, `/pitch/pitch.md exceeds 200KB (${pitchSize} bytes)`);
assert(/^---\n[\s\S]+\n---\n/m.test(pitchMd), "/pitch/pitch.md missing YAML frontmatter");
for (const key of ["version:", "last_updated:", "canonical_urls:", "contact:"]) {
  assert(pitchMd.includes(key), `/pitch/pitch.md frontmatter missing key: ${key}`);
}

const canonicalPaths = [
  "human: \"/pitch\"",
  "agent: \"/pitch/agent\"",
  "llms: \"/pitch/llms.txt\"",
  "transcript: \"/pitch/transcript.md\"",
  "faq: \"/pitch/faq.md\"",
];
for (const canonical of canonicalPaths) {
  assert(pitchMd.includes(canonical), `Missing canonical URL entry in /pitch/pitch.md: ${canonical}`);
}

const agentMarkdownFiles = ["pitch.md", "faq.md", "transcript.md", "skill.md", ".well-known/skills/default/skill.md"];
for (const file of agentMarkdownFiles) {
  const content = readPublicFile(file);
  assert(!/<script\b/i.test(content), `Forbidden <script> tag in ${file}`);
  assert(!/<iframe\b/i.test(content), `Forbidden <iframe> tag in ${file}`);
  assert(!/on[a-z]+\s*=/i.test(content), `Forbidden inline handler in ${file}`);
}

console.log("Pitch contract verification passed.");
