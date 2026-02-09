import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <div className="text-center py-12 text-zinc-500">
        No briefings generated yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {briefings.map((b) => (
        <Link key={b.id} href={`/briefings/${b.id}`}>
          <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-zinc-100">
                  {b.title}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    {b.actionsAnalyzed} actions
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    {b.agentsActive} agents
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">{b.summary}</p>
              <p className="text-xs text-zinc-600 mt-2">
                {new Date(b.generatedAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
