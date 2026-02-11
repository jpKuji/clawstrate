import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  BriefingTypePill,
  getBriefingTypeColor,
} from "@/components/briefings/BriefingTypePill";

interface Briefing {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  actionsAnalyzed: number | null;
  agentsActive: number | null;
  generatedAt: string;
}

export function BriefingList({ briefings }: { briefings: Briefing[] }) {
  if (briefings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <FileText className="size-10 mb-4 text-zinc-600" />
        <p className="text-lg font-medium text-zinc-400">No briefings yet</p>
        <p className="text-sm mt-1">
          Intelligence briefings will appear here once generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {briefings.map((b) => {
        const colors = getBriefingTypeColor(b.type);
        const timeAgo = formatDistanceToNow(new Date(b.generatedAt), {
          addSuffix: true,
        });

        return (
          <Link key={b.id} href={`/briefings/${b.id}`} className="group block">
            <div
              className={`rounded-lg border border-zinc-800 border-l-[3px] ${colors.border} bg-zinc-900/80 ${colors.hover} p-4 md:p-5 transition-all cursor-pointer`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Type pill + timestamp */}
                  <div className="flex items-center gap-3 mb-2">
                    <BriefingTypePill type={b.type} />
                    <span className="text-xs text-zinc-500">{timeAgo}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base md:text-lg font-semibold text-zinc-100 mb-1.5">
                    {b.title}
                  </h3>

                  {/* Summary */}
                  {b.summary && (
                    <p className="text-sm text-zinc-400 line-clamp-2">
                      {b.summary}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mt-3 text-xs text-zinc-500">
                    {b.actionsAnalyzed != null && (
                      <span>{b.actionsAnalyzed} actions</span>
                    )}
                    {b.agentsActive != null && (
                      <span>{b.agentsActive} agents</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="size-5 text-zinc-600 shrink-0 mt-2 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
