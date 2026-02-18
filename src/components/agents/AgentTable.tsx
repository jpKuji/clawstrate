import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { ActorKindBadge } from "@/components/shared/ActorKindBadge";
import type { SourceDisplayConfig } from "@/lib/sources/display";

interface Agent {
  id: string;
  displayName: string;
  displayLabel?: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  agentType: string | null;
  totalActions: number | null;
  lastSeenAt: string;
  platformIds?: string[];
  actorKind?: string;
  sourceProfileType?: "forum_ai" | "marketplace_ai" | "onchain_ai";
}

const typeColors: Record<string, string> = {
  content_creator: "border-emerald-800 text-emerald-400",
  commenter: "border-blue-800 text-blue-400",
  active: "border-teal-800 text-teal-400",
  lurker: "border-zinc-700 text-zinc-400",
  bot_farm: "border-red-800 text-red-400",
};

export function AgentTable({
  agents,
  sourceDisplayList,
}: {
  agents: Agent[];
  sourceDisplayList?: SourceDisplayConfig[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-400">Agent</TableHead>
          <TableHead className="text-zinc-400">Type</TableHead>
          <TableHead className="text-zinc-400 hidden md:table-cell">Sources</TableHead>
          <TableHead className="text-zinc-400 text-right">Influence</TableHead>
          <TableHead className="text-zinc-400 text-right hidden sm:table-cell">Autonomy</TableHead>
          <TableHead className="text-zinc-400 text-right hidden sm:table-cell">Activity</TableHead>
          <TableHead className="text-zinc-400 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow key={agent.id} className="border-zinc-800">
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/agents/${agent.id}`}
                  className="text-zinc-100 hover:text-white font-medium"
                >
                  {agent.displayLabel || agent.displayName}
                </Link>
                {agent.actorKind === "human" && <ActorKindBadge kind="human" />}
                {agent.sourceProfileType === "marketplace_ai" && (
                  <Badge
                    variant="outline"
                    className="border-zinc-700 text-zinc-500 text-[10px]"
                  >
                    marketplace
                  </Badge>
                )}
                {agent.sourceProfileType === "onchain_ai" && (
                  <Badge
                    variant="outline"
                    className="border-fuchsia-700 text-fuchsia-400 text-[10px]"
                  >
                    onchain
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={typeColors[agent.agentType || "lurker"] || typeColors.lurker}
              >
                {agent.agentType || "unknown"}
              </Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="flex items-center gap-1">
                {(agent.platformIds ?? []).map((pid) => (
                  <SourceBadge key={pid} sourceId={pid} size="sm" />
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {(agent.influenceScore ?? 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-zinc-300 hidden sm:table-cell">
              {(agent.autonomyScore ?? 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-zinc-300 hidden sm:table-cell">
              {(agent.activityScore ?? 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {agent.totalActions ?? 0}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
