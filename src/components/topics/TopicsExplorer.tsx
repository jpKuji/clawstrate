"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { TopicTable } from "./TopicTable";
import { SourceFilter } from "@/components/shared/SourceFilter";
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
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "all";
  const [topics, setTopics] = useState(initialTopics);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (source === "all" && topics === initialTopics) return;

    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams({ limit: "50" });
    if (source !== "all") params.set("source", source);

    fetch(`/api/v1/topics?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setTopics(data))
      .catch((e) => {
        if (!controller.signal.aborted) console.error(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [source]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <SourceFilter sourceDisplayList={sourceDisplayList} />
        {loading && (
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Loading...
          </span>
        )}
      </div>
      <div className="border border-zinc-800 bg-[var(--panel-bg)] overflow-hidden">
        <TopicTable topics={topics} />
      </div>
    </div>
  );
}
