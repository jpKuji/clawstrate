"use client";

import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

export function TerminalPanel({
  title,
  href,
  children,
  className,
  description,
  infoTooltip,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
  infoTooltip?: string;
}) {
  return (
    <div className={`border border-zinc-800 flex flex-col h-full overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-accent">
            {title}
          </span>
          {infoTooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <Info className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px]">
                  <p>{infoTooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      {description && (
        <div className="px-3 py-1 bg-zinc-900 border-t border-zinc-800/50">
          <p className="text-[10px] text-zinc-500">{description}</p>
        </div>
      )}
      <div className="flex-1 bg-[var(--panel-bg)] overflow-y-auto">{children}</div>
    </div>
  );
}
