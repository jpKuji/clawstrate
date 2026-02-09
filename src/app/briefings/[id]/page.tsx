import { PageContainer } from "@/components/layout/PageContainer";
import { BriefingReader } from "@/components/briefings/BriefingReader";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";

export const revalidate = 60;

async function getBriefing(id: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/narratives?id=${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const briefing = await getBriefing(id);

  if (!briefing) notFound();

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">{briefing.title}</h1>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="border-zinc-700 text-zinc-400">
            {briefing.actionsAnalyzed} actions analyzed
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400">
            {briefing.agentsActive} agents active
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400">
            {new Date(briefing.generatedAt).toLocaleString()}
          </Badge>
        </div>
      </div>
      <BriefingReader content={briefing.content} />
    </PageContainer>
  );
}
