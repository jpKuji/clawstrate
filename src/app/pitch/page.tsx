import type { Metadata } from "next";
import { Header } from "@/app/pitch/_components/Header";
import { PitchEffects } from "@/app/pitch/_components/PitchEffects";
import { TldrSection } from "@/app/pitch/_components/TldrSection";
import { VideoSection } from "@/app/pitch/_components/VideoSection";
import { loadPitchContent } from "@/lib/pitch/content";
import styles from "./pitch.module.css";
import { cx } from "./_components/cx";

export const metadata: Metadata = {
  title: "Clawstrate | Human Surface",
  description: "Real-time intelligence for 1.6M+ agents across Moltbook, ClawTask, and on-chain systems.",
};

export default function PitchPage() {
  const pitch = loadPitchContent();
  const tldrPoints = [
    pitch.one_liner,
    `ICP: ${pitch.icp}`,
    `Outcome: ${pitch.outcome}`,
    `Stage: ${pitch.traction.stage}`,
    `Ask: ${pitch.ask.looking_for.join(", ")}`,
    `Contact: ${pitch.contact.email}`,
  ];

  return (
    <div data-pitch-root className={styles.pitchRoot}>
      <PitchEffects />
      <Header />

      <main className={cx(styles, "container")}>
        <section id="home" className={cx(styles, "hero", "panel")}>
          <p className={cx(styles, "eyebrow")}>{pitch.title}</p>
          <h1>
            <span className={cx(styles, "text-gradient")}>{pitch.tagline}</span>
          </h1>
          <p className={cx(styles, "hero-oneliner")}>{pitch.one_liner}</p>
          <ul className={cx(styles, "feature-chips", "reveal-stagger")}>
            {pitch.hero_bullets.map((item) => (
              <li key={item} className={cx(styles, "feature-chip")}>
                {item}
              </li>
            ))}
          </ul>
          <div className={cx(styles, "hero-image-wrap", "reveal")}>
            <img
              className={cx(styles, "hero-image")}
              src="/pitch/bloomberg_keyboard.png"
              alt="Neon-lit keyboard representing the Clawstrate terminal surface"
            />
          </div>
          <div className={cx(styles, "cta-row")}>
            <a className={cx(styles, "btn", "primary")} href={pitch.links.contact}>
              Contact Founder
            </a>
            <a className={cx(styles, "btn", "secondary")} href="/pitch/agent">
              Open Agent Surface
            </a>
          </div>
        </section>

        <VideoSection videoSrc={pitch.links.video} captionsSrc="/pitch/transcript/pitch.vtt" />

        <TldrSection points={tldrPoints} />

        <section id="problem-solution" className={cx(styles, "panel", "reveal")}>
          <div className={cx(styles, "psw-grid")}>
            <div className={cx(styles, "psw-column")}>
              <h3>
                <span className={cx(styles, "psw-dot", "coral")}></span> Problem
              </h3>
              <ul>
                {pitch.problem.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className={cx(styles, "psw-column")}>
              <h3>
                <span className={cx(styles, "psw-dot", "cyan")}></span> Solution
              </h3>
              <ul>
                {pitch.solution.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className={cx(styles, "psw-column")}>
              <h3>
                <span className={cx(styles, "psw-dot", "gradient")}></span> Why Now
              </h3>
              <ul>
                {pitch.why_now.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="product" className={cx(styles, "panel", "reveal")}>
          <h2>Product</h2>
          <div className={cx(styles, "feature-grid", "reveal-stagger")}>
            {pitch.product.map((item, index) => (
              <div key={item} className={cx(styles, "feature-card")}>
                <div className={cx(styles, "feature-index")}>{String(index + 1).padStart(2, "0")}</div>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="business-model" className={cx(styles, "panel", "reveal")}>
          <h2>Business Model</h2>
          <div className={cx(styles, "feature-grid", "reveal-stagger")}>
            {pitch.business_model.map((item, index) => (
              <div key={item} className={cx(styles, "feature-card")}>
                <div className={cx(styles, "feature-index")}>{String(index + 1).padStart(2, "0")}</div>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="moat" className={cx(styles, "panel", "reveal")}>
          <h2>Moat</h2>
          <ul>
            {pitch.moat.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="traction" className={cx(styles, "panel", "reveal")}>
          <h2>Traction</h2>
          <div className={cx(styles, "stage-badge")}>
            <span className={cx(styles, "stage-dot")}></span>
            {pitch.traction.stage}
          </div>
          <h3>Metrics</h3>
          <div className={cx(styles, "metrics-grid", "reveal-stagger")}>
            {pitch.traction.metrics.map((item) => (
              <div key={item} className={cx(styles, "metric-card")}>
                {item}
              </div>
            ))}
          </div>
          <h3>Proof Points</h3>
          <ul>
            {pitch.traction.proof_points.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="team" className={cx(styles, "panel", "reveal")}>
          <h2>Team</h2>
          <div className={cx(styles, "team-grid", "reveal-stagger")}>
            {pitch.team.map((member) => (
              <div key={member.name} className={cx(styles, "team-card")}>
                <div className={cx(styles, "team-avatar")}>{member.name.charAt(0)}</div>
                <div className={cx(styles, "team-info")}>
                  <h3>{member.name}</h3>
                  <div className={cx(styles, "team-role")}>{member.role}</div>
                  <p>{member.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="ask" className={cx(styles, "panel", "ask-panel", "reveal")}>
          <h2>The Ask</h2>
          <div className={cx(styles, "ask-grid")}>
            <div>
              <h3>What We&apos;re Looking For</h3>
              <ul>
                {pitch.ask.looking_for.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Use of Funds</h3>
              <ul>
                {pitch.ask.use_of_funds.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className={cx(styles, "cta-row")}>
            <a className={cx(styles, "btn", "primary")} href={pitch.links.contact}>
              Contact Founder
            </a>
            <a className={cx(styles, "btn", "secondary")} href="/pitch/agent">
              Open Agent Surface
            </a>
          </div>
        </section>
      </main>

      <footer className={cx(styles, "site-footer")}>
        <hr className={cx(styles, "glow-line")} />
        <nav className={cx(styles, "footer-nav")} aria-label="Footer navigation">
          <a href="/pitch">Home</a>
          <a href="/pitch/agent">Agent</a>
          <a href="/pitch/faq.md">FAQ</a>
        </nav>
        <div className={cx(styles, "footer-inner")}>
          <div className={cx(styles, "footer-contact")}>
            <p>
              Contact: <a href={`mailto:${pitch.contact.email}`}>{pitch.contact.name}</a>
            </p>
            <p>
              <a href="https://www.linkedin.com/in/julian-p-7038a7130/" target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </p>
          </div>
          <a className={cx(styles, "ecosystem-badge")} href="https://openclaw.ai" target="_blank" rel="noopener noreferrer">
            <span className={cx(styles, "ecosystem-dot")}></span>
            Part of the OpenClaw ecosystem
          </a>
        </div>
      </footer>
    </div>
  );
}
