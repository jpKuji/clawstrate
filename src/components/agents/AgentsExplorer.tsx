"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { AgentTable } from "./AgentTable";
import { SourceFilter } from "@/components/shared/SourceFilter";
import type { SourceDisplayConfig } from "@/lib/sources/display";

interface Agent {
  id: string;
  displayName: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  agentType: string | null;
  totalActions: number | null;
  lastSeenAt: string;
  platformIds?: string[];
}

export function AgentsExplorer({
  initialAgents,
  sourceDisplayList,
}: {
  initialAgents: Agent[];
  sourceDisplayList: SourceDisplayConfig[];
}) {
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "all";
  const [agents, setAgents] = useState(initialAgents);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (source === "all" && agents === initialAgents) return;

    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams({ limit: "50" });
    if (source !== "all") params.set("source", source);

    fetch(`/api/v1/agents?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setAgents(data))
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
        <AgentTable agents={agents} sourceDisplayList={sourceDisplayList} />
      </div>
    </div>
  );
}
