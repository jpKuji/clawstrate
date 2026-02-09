import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BriefingSummary({
  briefing,
}: {
  briefing: {
    id: string;
    title: string;
    summary: string | null;
    generatedAt: string;
  } | null;
}) {
  if (!briefing) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-8 text-center text-zinc-500">
          No briefings yet. Run the pipeline to generate your first one.
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={`/briefings/${briefing.id}`}>
      <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-zinc-100">
              {briefing.title}
            </CardTitle>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {new Date(briefing.generatedAt).toLocaleDateString()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400">{briefing.summary}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
