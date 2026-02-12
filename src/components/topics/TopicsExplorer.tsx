"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useCallback, useTransition } from "react";
import { TopicTable } from "./TopicTable";
import type { SourceDisplayConfig } from "@/lib/sources/display";

interface Topic {
  id: string;
  slug: string;
  name: string;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
}

export function TopicsExplorer({
  initialTopics,
  sourceDisplayList,
}: {
  initialTopics: Topic[];
  sourceDisplayList: SourceDisplayConfig[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const source = searchParams.get("source") || "all";
  const [topics, setTopics] = useState(initialTopics);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSourceChange = useCallback(
    (value: string) => {
      setLoading(true);

      const params = new URLSearchParams({ limit: "50" });
      if (value !== "all") params.set("source", value);

      fetch(`/api/v1/topics?${params}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((data) => {
          setTopics(data);
          const urlParams = new URLSearchParams(searchParams.toString());
          if (value === "all") {
            urlParams.delete("source");
          } else {
            urlParams.set("source", value);
          }
          const qs = urlParams.toString();
          startTransition(() => {
            router.replace(qs ? `${pathname}?${qs}` : pathname, {
              scroll: false,
            });
          });
        })
        .catch((e) => console.error(e))
        .finally(() => setLoading(false));
    },
    [router, pathname, searchParams, startTransition]
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="h-9 w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
        >
          <option value="all">All sources</option>
          {sourceDisplayList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        {(loading || isPending) && (
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Loading...
          </span>
        )}
        {source !== "all" && (
          <p className="text-[11px] text-zinc-500 mt-1">
            {sourceDisplayList.find((s) => s.id === source)?.description}
          </p>
        )}
      </div>
      {topics.length === 0 ? (
        <div className="border border-zinc-800 bg-[var(--panel-bg)] px-6 py-12 text-center">
          <p className="text-zinc-500 text-sm">No topics found</p>
          {source !== "all" && (
            <p className="text-zinc-600 text-xs mt-1">
              Data from {sourceDisplayList.find((s) => s.id === source)?.displayName ?? source} may not have been ingested yet
            </p>
          )}
        </div>
      ) : (
        <div className="border border-zinc-800 bg-[var(--panel-bg)] overflow-hidden">
          <TopicTable topics={topics} />
        </div>
      )}
    </div>
  );
}
