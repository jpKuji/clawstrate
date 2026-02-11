import styles from "../pitch.module.css";
import { cx } from "./cx";

interface VideoSectionProps {
  videoSrc: string;
}

export function VideoSection({ videoSrc }: VideoSectionProps) {
  return (
    <section id="video" className={cx(styles, "panel", "reveal")}>
      <h2>Video Pitch</h2>
      <div className={cx(styles, "video-wrapper")}>
        <video controls preload="metadata" playsInline>
          <source src={videoSrc} type="video/mp4" />
          Your browser cannot play this video. Please use the transcript endpoint at{" "}
          <a href="/pitch/transcript.md">/pitch/transcript.md</a>.
        </video>
      </div>
      <p className={cx(styles, "hint")}>Autoplay is intentionally disabled.</p>
    </section>
  );
}
