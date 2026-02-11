"use client";

import { useEffect, useState } from "react";

interface TickerItem {
  type: string;
  text: string;
}

export function AlertTicker({ items }: { items: TickerItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) return;

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-1.5 overflow-hidden">
      <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-accent shrink-0">
        {current.type}
      </span>
      <span className="font-data text-[11px] text-zinc-400 truncate">
        {current.text}
      </span>
      {items.length > 1 && (
        <span className="font-data text-[10px] text-zinc-600 shrink-0 ml-auto">
          {index + 1}/{items.length}
        </span>
      )}
    </div>
  );
}
