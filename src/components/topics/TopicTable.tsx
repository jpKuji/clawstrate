import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Topic {
  id: string;
  slug: string;
  name: string;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
}

export function TopicTable({ topics }: { topics: Topic[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-400">Topic</TableHead>
          <TableHead className="text-zinc-400 text-right">Velocity</TableHead>
          <TableHead className="text-zinc-400 text-right">Actions</TableHead>
          <TableHead className="text-zinc-400 text-right">Agents</TableHead>
          <TableHead className="text-zinc-400 text-right">Sentiment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topics.map((topic) => (
          <TableRow key={topic.id} className="border-zinc-800">
            <TableCell>
              <Link
                href={`/topics/${topic.slug}`}
                className="text-zinc-100 hover:text-white font-medium"
              >
                {topic.name}
              </Link>
              <span className="text-xs text-zinc-600 ml-2">/{topic.slug}</span>
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {(topic.velocity ?? 0).toFixed(2)}/hr
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {topic.actionCount ?? 0}
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {topic.agentCount ?? 0}
            </TableCell>
            <TableCell className="text-right text-zinc-300">
              {topic.avgSentiment != null ? topic.avgSentiment.toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
