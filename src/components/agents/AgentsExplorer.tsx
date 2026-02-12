"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useCallback, useTransition } from "react";
import { AgentTable } from "./AgentTable";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const source = searchParams.get("source") || "all";
  const [agents, setAgents] = useState(initialAgents);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSourceChange = useCallback(
    (value: string) => {
      setLoading(true);

      const params = new URLSearchParams({ limit: "50" });
      if (value !== "all") params.set("source", value);

      fetch(`/api/v1/agents?${params}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((data) => {
          setAgents(data);
          // Update URL without full navigation
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
      </div>
      <div className="border border-zinc-800 bg-[var(--panel-bg)] overflow-hidden">
        <AgentTable agents={agents} sourceDisplayList={sourceDisplayList} />
      </div>
    </div>
  );
}
