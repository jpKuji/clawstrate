import Link from "next/link";
import { Bot, Hash, Zap } from "lucide-react";

interface CitationChipProps {
  type: "agent" | "topic" | "action";
  id?: string;
  agentId?: string;
  label?: string;
  slug?: string;
}

const TYPE_CONFIG = {
  agent: {
    icon: Bot,
    bg: "bg-cyan-950/50 hover:bg-cyan-900/50",
    text: "text-[var(--accent-cyan)]",
    border: "border-cyan-800/50",
  },
  topic: {
    icon: Hash,
    bg: "bg-blue-950/50 hover:bg-blue-900/50",
    text: "text-blue-400",
    border: "border-blue-800/50",
  },
  action: {
    icon: Zap,
    bg: "bg-zinc-800/50 hover:bg-zinc-700/50",
    text: "text-zinc-400",
    border: "border-zinc-700/50",
  },
};

export function CitationChip({ type, id, agentId, label, slug }: CitationChipProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  const displayLabel =
    type === "agent"
      ? `@${label || id || agentId}`
      : type === "topic"
        ? `#${slug || label}`
        : label || id || slug;

  const href =
    type === "agent"
      ? `/agents/${encodeURIComponent(agentId || id || "")}`
      : type === "topic"
        ? `/topics/${encodeURIComponent(slug || "")}`
        : null;

  const chip = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${config.bg} ${config.text} ${config.border}`}
    >
      <Icon className="size-3" />
      {displayLabel}
    </span>
  );

  if (href) {
    return <Link href={href}>{chip}</Link>;
  }

  return chip;
}
