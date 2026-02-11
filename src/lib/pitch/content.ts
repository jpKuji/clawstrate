import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const TeamMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  bio: z.string().min(1),
});

const PitchContentSchema = z.object({
  project_slug: z.string().min(1),
  version: z.string().min(1),
  last_updated: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string().min(1),
  one_liner: z.string().min(1),
  icp: z.string().min(1),
  outcome: z.string().min(1),
  hero_bullets: z.array(z.string().min(1)).min(2),
  problem: z.array(z.string().min(1)).min(1),
  solution: z.array(z.string().min(1)).min(1),
  why_now: z.array(z.string().min(1)).min(1),
  product: z.array(z.string().min(1)).min(1),
  business_model: z.array(z.string().min(1)).min(1),
  competition: z.array(z.string().min(1)).min(1),
  moat: z.array(z.string().min(1)).min(1),
  traction: z.object({
    stage: z.string().min(1),
    metrics: z.array(z.string().min(1)).min(1),
    proof_points: z.array(z.string().min(1)).min(1),
  }),
  team: z.array(TeamMemberSchema).min(1),
  ask: z.object({
    looking_for: z.array(z.string().min(1)).min(1),
    use_of_funds: z.array(z.string().min(1)).min(1),
  }),
  links: z.object({
    video: z.string().min(1),
    deck: z.string().min(1),
    contact: z.string().min(1),
  }),
  contact: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  company: z.object({
    legal_name: z.string().min(1),
    jurisdiction_note: z.string().min(1),
  }),
});

export type PitchContent = z.infer<typeof PitchContentSchema>;
export type PitchMarkdownName = "faq.md" | "transcript.md";

function normalizePitchPath(href: string): string {
  if (!href.startsWith("/")) return href;
  if (href.startsWith("/pitch")) return href;
  return `/pitch${href}`;
}

function normalizePitchContentLinks(content: PitchContent): PitchContent {
  return {
    ...content,
    links: {
      ...content.links,
      video: normalizePitchPath(content.links.video),
      deck: normalizePitchPath(content.links.deck),
    },
  };
}

export function loadPitchContent(cwd = process.cwd()): PitchContent {
  const filePath = path.join(cwd, "content", "pitch", "pitch.yaml");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw);
  const content = PitchContentSchema.parse(parsed);
  return normalizePitchContentLinks(content);
}

export function readPitchMarkdown(name: PitchMarkdownName, cwd = process.cwd()): string {
  const filePath = path.join(cwd, "content", "pitch", name);
  return fs.readFileSync(filePath, "utf8").trim();
}
