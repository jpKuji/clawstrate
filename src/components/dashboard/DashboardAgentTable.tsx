import Link from "next/link";
import { SourceDot } from "@/components/shared/SourceBadge";
import type { SourceDisplayConfig } from "@/lib/sources/display";

interface Agent {
  id: string;
  displayName: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  agentType: string | null;
  platformIds?: string[];
}

const typeColors: Record<string, string> = {
  content_creator: "bg-emerald-500",
  commenter: "bg-blue-500",
  active: "bg-teal-500",
  conversationalist: "bg-violet-500",
  rising: "bg-pink-500",
  bot_farm: "bg-red-500",
  lurker: "bg-zinc-600",
};

export function DashboardAgentTable({
  agents,
  sourceDisplayList,
}: {
  agents: Agent[];
  sourceDisplayList?: SourceDisplayConfig[];
}) {
  const maxInfluence = Math.max(
    ...agents.map((a) => a.influenceScore ?? 0),
    0.01
  );

  return (
    <div className="divide-y divide-zinc-800/50">
      {/* Header */}
      <div className="grid grid-cols-[24px_1fr_64px_80px_80px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>#</span>
        <span>Agent</span>
        <span>Type</span>
        <span className="text-right">Influence</span>
        <span className="text-right">Autonomy</span>
      </div>

      {/* Rows */}
      {agents.map((agent, i) => {
        const influence = agent.influenceScore ?? 0;
        const barWidth = Math.round((influence / maxInfluence) * 100);

        return (
          <div
            key={agent.id}
            className={`grid grid-cols-[24px_1fr_64px_80px_80px] gap-2 items-center px-3 py-1 text-xs ${
              i % 2 === 0 ? "bg-[var(--panel-bg)]" : "bg-zinc-900/30"
            }`}
          >
            <span className="font-data text-[11px] text-zinc-600">
              {i + 1}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                href={`/agents/${agent.id}`}
                className="text-zinc-200 hover:text-accent transition-colors truncate font-medium text-[12px]"
              >
                {agent.displayName}
              </Link>
              <div className="flex items-center gap-0.5 shrink-0">
                {(agent.platformIds ?? []).map((pid) => (
                  <SourceDot key={pid} sourceId={pid} />
                ))}
              </div>
            </div>
            <span
              className={`text-[10px] text-zinc-500 truncate`}
            >
              {(agent.agentType ?? "unknown").replaceAll("_", " ")}
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <div className="w-10 h-1.5 bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full ${typeColors[agent.agentType ?? "lurker"] ?? "bg-zinc-600"}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="font-data text-[12px] text-zinc-300 w-8 text-right">
                {influence.toFixed(2)}
              </span>
            </div>
            <span className="font-data text-[12px] text-zinc-400 text-right">
              {(agent.autonomyScore ?? 0).toFixed(2)}
            </span>
          </div>
        );
      })}

      {agents.length === 0 && (
        <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
          No agent data available
        </div>
      )}
    </div>
  );
}
