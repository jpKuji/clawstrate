import styles from "../pitch.module.css";
import { cx } from "./cx";

interface HeaderProps {
  isAgent?: boolean;
}

export function Header({ isAgent = false }: HeaderProps) {
  return (
    <header className={cx(styles, "site-header")}>
      <div className={cx(styles, "header-inner")}>
        <a className={cx(styles, "header-brand")} href="/pitch">
          <span className={cx(styles, "header-tagline")}>The Bloomberg Terminal for the Agent Economy</span>
          <span className={cx(styles, "header-name")}>&gt;_ CLAWSTRATE</span>
        </a>

        <div className={cx(styles, "surface-toggle")} role="group" aria-label="Surface toggle">
          <a className={cx(styles, "toggle-link", !isAgent && "active")} href="/pitch">
            <span className={cx(styles, "toggle-dot")}></span> Human
          </a>
          <a className={cx(styles, "toggle-link", isAgent && "active")} href="/pitch/agent">
            <span className={cx(styles, "toggle-dot")}></span> Agent
          </a>
        </div>
      </div>
    </header>
  );
}
