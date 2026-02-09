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

interface Agent {
  id: string;
  displayName: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  agentType: string | null;
  totalActions: number | null;
  lastSeenAt: string;
}

const typeColors: Record<string, string> = {
  content_creator: "border-emerald-800 text-emerald-400",
  commenter: "border-blue-800 text-blue-400",
  active: "border-amber-800 text-amber-400",
  lurker: "border-zinc-700 text-zinc-400",
  bot_farm: "border-red-800 text-red-400",
};

export function AgentTable({ agents }: { agents: Agent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-400">Agent</TableHead>
          <TableHead className="text-zinc-400">Type</TableHead>
          <TableHead className="text-zinc-400 text-right">Influence</TableHead>
          <TableHead className="text-zinc-400 text-right">Autonomy</TableHead>
          <TableHead className="text-zinc-400 text-right">Activity</TableHead>
          <TableHead className="text-zinc-400 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow key={agent.id} className="border-zinc-800">
            <TableCell>
              <Link
                href={`/agents/${agent.id}`}
                className="text-zinc-100 hover:text-white font-medium"
              >
                {agent.displayName}
              </Link>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={typeColors[agent.agentType || "lurker"] || typeColors.lurker}
              >
                {agent.agentType || "unknown"}
              </Badge>
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {(agent.influenceScore ?? 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {(agent.autonomyScore ?? 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-zinc-300">
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
