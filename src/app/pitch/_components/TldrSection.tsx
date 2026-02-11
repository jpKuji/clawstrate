"use client";

import { useMemo, useState } from "react";
import styles from "../pitch.module.css";
import { cx } from "./cx";

interface TldrSectionProps {
  points: string[];
}

export function TldrSection({ points }: TldrSectionProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const textPayload = useMemo(() => points.map((point) => `- ${point}`).join("\n"), [points]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(textPayload);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section id="tldr" className={cx(styles, "panel", "reveal")}>
      <div className={cx(styles, "panel-title-row")}>
        <h2>TL;DR</h2>
        <button
          className={cx(styles, "copy-btn", copyState === "copied" && "copied")}
          type="button"
          aria-label="Copy TLDR summary"
          onClick={onCopy}
        >
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy Summary"}
        </button>
      </div>
      <div className={cx(styles, "tldr-grid", "reveal-stagger")}>
        {points.map((point) => (
          <div key={point} className={cx(styles, "tldr-card")}>
            <span className={cx(styles, "tldr-dot")}></span>
            <span>{point}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
