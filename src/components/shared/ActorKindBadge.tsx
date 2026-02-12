"use client";

export function ActorKindBadge({ kind }: { kind: "ai" | "human" }) {
  if (kind === "human") {
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded border border-amber-800/60 text-amber-500/80 bg-amber-950/30">
        Human
      </span>
    );
  }
  return null;
}
