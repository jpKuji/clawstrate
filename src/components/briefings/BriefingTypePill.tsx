import { Zap, Sun, Calendar, AlertTriangle } from "lucide-react";

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  briefing_6h: {
    label: "6H BRIEF",
    icon: Zap,
    color: "bg-cyan-950/60 text-cyan-400 border-cyan-800/50",
  },
  briefing_daily: {
    label: "DAILY",
    icon: Sun,
    color: "bg-amber-950/60 text-amber-400 border-amber-800/50",
  },
  weekly_summary: {
    label: "WEEKLY",
    icon: Calendar,
    color: "bg-violet-950/60 text-violet-400 border-violet-800/50",
  },
  alert: {
    label: "ALERT",
    icon: AlertTriangle,
    color: "bg-red-950/60 text-red-400 border-red-800/50",
  },
};

const DEFAULT_CONFIG = {
  label: "BRIEFING",
  icon: Zap,
  color: "bg-zinc-900 text-zinc-400 border-zinc-800",
};

export function BriefingTypePill({ type }: { type: string }) {
  const config = TYPE_CONFIG[type] || DEFAULT_CONFIG;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wider ${config.color}`}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}

export function getBriefingTypeColor(type: string) {
  const config = TYPE_CONFIG[type];
  if (!config) return { border: "border-zinc-700", hover: "hover:bg-zinc-800/50", accent: "text-zinc-400" };

  switch (type) {
    case "briefing_6h":
      return { border: "border-l-cyan-500", hover: "hover:bg-cyan-950/10", accent: "text-cyan-400" };
    case "briefing_daily":
      return { border: "border-l-amber-500", hover: "hover:bg-amber-950/10", accent: "text-amber-400" };
    case "weekly_summary":
      return { border: "border-l-violet-500", hover: "hover:bg-violet-950/10", accent: "text-violet-400" };
    case "alert":
      return { border: "border-l-red-500", hover: "hover:bg-red-950/10", accent: "text-red-400" };
    default:
      return { border: "border-l-zinc-700", hover: "hover:bg-zinc-800/50", accent: "text-zinc-400" };
  }
}
