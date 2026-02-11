import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import { Header } from "@/app/pitch/_components/Header";
import { PitchEffects } from "@/app/pitch/_components/PitchEffects";
import { cx } from "@/app/pitch/_components/cx";
import { loadPitchContent } from "@/lib/pitch/content";
import styles from "../pitch.module.css";

const endpoints = [
  { path: "/pitch/llms.txt", desc: "LLM-friendly site index", order: "01" },
  { path: "/pitch/pitch.md", desc: "Full pitch in markdown", order: "02" },
  { path: "/pitch/faq.md", desc: "Frequently asked questions", order: "03" },
  { path: "/pitch/transcript.md", desc: "Video pitch transcript", order: "04" },
  { path: "/pitch/skill.md", desc: "Skill definition for agents", order: "05" },
] as const;

const optionalEndpoints = [
  { path: "/pitch/llms-full.txt", desc: "Extended LLM context" },
  { path: "/pitch/.well-known/skills/index.json", desc: "Skills manifest" },
] as const;

export const metadata: Metadata = {
  title: "Clawstrate | Agent Surface",
  description: "Machine-friendly entrypoint for pitch resources",
};

function loadPitchMarkdownPreview(): string {
  const pitchMdPath = path.join(process.cwd(), "public", "pitch", "pitch.md");
  if (!fs.existsSync(pitchMdPath)) {
    return "# Build required\nRun `npm run pitch:build` to generate `/public/pitch/pitch.md`.";
  }

  return fs.readFileSync(pitchMdPath, "utf8");
}

export default function PitchAgentPage() {
  const pitch = loadPitchContent();
  const markdownPreview = loadPitchMarkdownPreview();

  return (
    <div data-pitch-root className={styles.pitchRoot}>
      <PitchEffects />
      <Header isAgent />

      <main className={cx(styles, "container")}>
        <section className={cx(styles, "panel", "reveal")}>
          <p className={cx(styles, "eyebrow")}>Agent Surface</p>
          <h1>
            If you are an agent, <span className={cx(styles, "text-gradient")}>start here</span>
          </h1>

          <div className={cx(styles, "endpoint-list", "reveal-stagger")}>
            {endpoints.map((endpoint) => (
              <a key={endpoint.path} href={endpoint.path} className={cx(styles, "endpoint-card")}>
                <span className={cx(styles, "endpoint-status")}></span>
                <span className={cx(styles, "endpoint-order")}>{endpoint.order}</span>
                <span className={cx(styles, "endpoint-path")}>{endpoint.path}</span>
                <span className={cx(styles, "endpoint-desc")}>{endpoint.desc}</span>
              </a>
            ))}
          </div>

          <h3 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Optional discovery endpoints</h3>
          <div className={cx(styles, "endpoint-list")}>
            {optionalEndpoints.map((endpoint) => (
              <a key={endpoint.path} href={endpoint.path} className={cx(styles, "endpoint-card", "optional")}>
                <span className={cx(styles, "endpoint-status")}></span>
                <span className={cx(styles, "endpoint-path")}>{endpoint.path}</span>
                <span className={cx(styles, "endpoint-desc")}>{endpoint.desc}</span>
              </a>
            ))}
          </div>
        </section>

        <section className={cx(styles, "panel", "reveal")}>
          <h2>Read-only preview of /pitch/pitch.md</h2>
          <div className={cx(styles, "markdown-preview")}>
            <ReactMarkdown>{markdownPreview}</ReactMarkdown>
          </div>
        </section>
      </main>
    </div>
  );
}
