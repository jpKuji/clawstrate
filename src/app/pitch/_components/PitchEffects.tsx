"use client";

import { useEffect } from "react";
import styles from "../pitch.module.css";

export function PitchEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-pitch-root]");
    if (!root) {
      return;
    }

    const revealSelector = `.${styles.reveal}, .${styles["reveal-stagger"]}`;
    const revealTargets = Array.from(root.querySelectorAll<HTMLElement>(revealSelector));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );

    revealTargets.forEach((element) => observer.observe(element));

    const header = root.querySelector<HTMLElement>(`.${styles["site-header"]}`);
    const onScroll = () => {
      if (header) {
        header.classList.toggle(styles.scrolled, window.scrollY > 20);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
