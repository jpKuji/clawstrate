"use client";

import type { SourceDisplayConfig } from "@/lib/sources/display";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface SourceActivityItem {
  platformId: string;
  posts: { current: number; change: number };
  comments: { current: number; change: number };
  topOffering: { title: string; replies: number; url: string } | null;
}

function ChangeDelta({ value }: { value: number }) {
  if (value > 0) {
    return <span className="text-emerald-400">(+{value})</span>;
  }
  if (value < 0) {
    return <span className="text-red-400">({value})</span>;
  }
  return <span className="text-zinc-600">(0)</span>;
}

export function SourceActivityStrip({
  sourceActivity,
  sourceDisplayList,
}: {
  sourceActivity: SourceActivityItem[];
  sourceDisplayList: SourceDisplayConfig[];
}) {
  if (sourceActivity.length === 0) return null;

  const displayMap = new Map(sourceDisplayList.map((s) => [s.id, s]));

  return (
    <TooltipProvider>
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950 px-4 py-1.5 overflow-x-auto">
        {sourceActivity.map((item, i) => {
          const config = displayMap.get(item.platformId);
          const postLabel = config?.postLabel ?? "Posts";
          const commentLabel = config?.commentLabel ?? "Comments";
          const dotColor = config?.dotColor ?? "bg-zinc-500";
          const displayName = config?.displayName ?? item.platformId;

          return (
            <div key={item.platformId} className="flex items-center">
              {i > 0 && <div className="h-3 w-px bg-zinc-700 mx-3 shrink-0" />}

              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${dotColor}`}
                />

                {item.topOffering ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 cursor-default">
                        {displayName}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Top {postLabel.replace(/s$/, "")}:{" "}
                      {item.topOffering.title} ({item.topOffering.replies})
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {displayName}
                  </span>
                )}

                <span className="font-data text-[11px] text-zinc-300 ml-1">
                  {item.posts.current.toLocaleString()}
                </span>
                <span className="text-[10px] text-zinc-500">{postLabel}</span>
                <span className="text-[10px]">
                  <ChangeDelta value={item.posts.change} />
                </span>

                <span className="text-zinc-600 mx-1">&middot;</span>

                <span className="font-data text-[11px] text-zinc-300">
                  {item.comments.current.toLocaleString()}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {commentLabel}
                </span>
                <span className="text-[10px]">
                  <ChangeDelta value={item.comments.change} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
