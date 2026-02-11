import { AlertOctagon, AlertTriangle, Info } from "lucide-react";

interface AlertBannerProps {
  level: "info" | "warning" | "critical";
  message: string;
  onInteract?: () => void;
}

const LEVEL_CONFIG = {
  critical: {
    icon: AlertOctagon,
    label: "CRITICAL",
    accent: "bg-red-500",
    bg: "bg-red-950/30",
    border: "border-red-900/50",
    text: "text-red-300",
    labelColor: "text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    label: "WARNING",
    accent: "bg-amber-500",
    bg: "bg-amber-950/30",
    border: "border-amber-900/50",
    text: "text-amber-300",
    labelColor: "text-amber-400",
  },
  info: {
    icon: Info,
    label: "INFO",
    accent: "bg-blue-500",
    bg: "bg-blue-950/30",
    border: "border-blue-900/50",
    text: "text-blue-300",
    labelColor: "text-blue-400",
  },
};

export function AlertBanner({ level, message, onInteract }: AlertBannerProps) {
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`relative overflow-hidden rounded-lg border ${config.border} ${config.bg} p-4 pl-5 cursor-pointer hover:brightness-110 transition-all`}
      onClick={onInteract}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onInteract?.();
      }}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.accent}`} />

      <div className="flex items-start gap-3">
        <Icon className={`size-4 mt-0.5 shrink-0 ${config.labelColor}`} />
        <div className="min-w-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${config.labelColor}`}
          >
            {config.label}
          </span>
          <p className={`text-sm mt-0.5 ${config.text}`}>{message}</p>
        </div>
      </div>
    </div>
  );
}
