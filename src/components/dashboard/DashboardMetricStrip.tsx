"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface Metric {
  label: string;
  value: string | number;
  change?: number;
  tooltip?: string;
}

interface Briefing {
  id: string;
  title: string;
  summary: string | null;
  generatedAt: string;
}

export function DashboardMetricStrip({
  metrics,
  briefing,
}: {
  metrics: Metric[];
  briefing: Briefing | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_2fr] gap-px bg-zinc-800">
      {metrics.map((metric, i) => (
        <div key={i} className="bg-[var(--panel-bg)] px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-cyan)]/80 mb-1 flex items-center gap-1">
            {metric.label}
            {metric.tooltip && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-zinc-600 hover:text-zinc-400 transition-colors">
                      <Info className="size-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p>{metric.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </p>
          <p className="font-data text-[28px] font-bold leading-none text-zinc-50">
            {metric.value}
          </p>
          {metric.change !== undefined && (
            <span
              className={`font-data text-[11px] ${
                metric.change > 0
                  ? "text-emerald-500"
                  : metric.change < 0
                    ? "text-red-500"
                    : "text-zinc-500"
              }`}
            >
              {metric.change > 0 ? "+" : ""}
              {typeof metric.change === "number"
                ? Number.isInteger(metric.change)
                  ? metric.change
                  : metric.change.toFixed(2)
                : metric.change}
            </span>
          )}
        </div>
      ))}

      {/* Latest briefing panel - visible on lg+ */}
      <div className="hidden lg:flex col-span-2 md:col-span-5 lg:col-span-1 bg-[var(--panel-bg)] px-3 py-3 flex-col justify-center">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-cyan)]/80 mb-1">
          Latest Briefing
        </p>
        {briefing ? (
          <Link
            href={`/briefings/${briefing.id}`}
            className="group"
          >
            <p className="text-sm font-medium text-zinc-100 truncate group-hover:text-accent transition-colors">
              {briefing.title}
            </p>
            {briefing.summary && (
              <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                {briefing.summary}
              </p>
            )}
          </Link>
        ) : (
          <p className="text-[11px] text-zinc-600">No briefings yet</p>
        )}
      </div>
    </div>
  );
}
