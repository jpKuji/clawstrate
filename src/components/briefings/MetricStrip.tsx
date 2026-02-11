import type { BriefingMetric } from "@/lib/briefing-parser";

export function MetricStrip({
  metrics,
}: {
  metrics: Record<string, BriefingMetric>;
}) {
  const entries = Object.values(metrics);
  if (entries.length === 0) return null;

  return (
    <div className="relative">
      {/* Top gradient accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/40 to-transparent" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-zinc-800/30">
        {entries.map((metric, i) => (
          <div key={i} className="bg-zinc-900/80 px-4 py-4">
            <p className="text-[10px] uppercase tracking-widest text-accent mb-1">
              {metric.label}
            </p>
            <p className="text-2xl md:text-3xl font-bold tabular-nums text-zinc-100">
              {metric.value}
            </p>
            {metric.change && (
              <p
                className={`text-xs mt-1 font-medium ${
                  metric.change.startsWith("+")
                    ? "text-emerald-400"
                    : metric.change.startsWith("-")
                      ? "text-red-400"
                      : "text-zinc-400"
                }`}
              >
                {metric.change}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
