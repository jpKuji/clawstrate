import { PageContainer } from "@/components/layout/PageContainer";
import { BriefingReader } from "@/components/briefings/BriefingReader";
import { BriefingViewTracker } from "@/components/briefings/BriefingViewTracker";
import { ReadingProgress } from "@/components/briefings/ReadingProgress";
import { BriefingTypePill } from "@/components/briefings/BriefingTypePill";
import { isStructuredBriefing } from "@/lib/briefing-parser";
import { MetricStrip } from "@/components/briefings/MetricStrip";
import { Activity, Users, Clock, Gauge } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <Icon className="size-4 text-zinc-500" />
      <span className="text-zinc-500">{label}:</span>
      <span className="text-zinc-300 font-medium">{value}</span>
    </div>
  );
}

function formatPeriod(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const briefing = await getBriefing(id);

  if (!briefing) notFound();

  const structured = isStructuredBriefing(briefing.content);
  const timeAgo = formatDistanceToNow(new Date(briefing.generatedAt), {
    addSuffix: true,
  });
  const period = formatPeriod(briefing.periodStart, briefing.periodEnd);

  return (
    <>
      <ReadingProgress />
      <PageContainer>
        <BriefingViewTracker narrativeId={briefing.id} />

        {/* Hero header */}
        <header className="mb-8">
          {/* Type pill + relative time */}
          <div className="flex items-center gap-3 mb-4">
            <BriefingTypePill type={briefing.type} />
            <span className="text-sm text-zinc-500">{timeAgo}</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-100 mb-3">
            {briefing.title}
          </h1>

          {/* Summary */}
          {briefing.summary && (
            <p className="text-lg text-zinc-400 max-w-3xl mb-6">
              {briefing.summary}
            </p>
          )}

          {/* Meta strip with icons */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 border-t border-zinc-800">
            <MetaItem
              icon={Activity}
              label="Actions"
              value={briefing.actionsAnalyzed}
            />
            <MetaItem
              icon={Users}
              label="Agents"
              value={briefing.agentsActive}
            />
            {period && (
              <MetaItem icon={Clock} label="Period" value={period} />
            )}
            {briefing.networkAutonomyAvg != null && (
              <MetaItem
                icon={Gauge}
                label="Autonomy"
                value={briefing.networkAutonomyAvg.toFixed(2)}
              />
            )}
          </div>
        </header>

        {/* Page-level MetricStrip for structured briefings */}
        {structured?.metrics &&
          Object.keys(structured.metrics).length > 0 && (
            <div className="mb-8">
              <MetricStrip metrics={structured.metrics} />
            </div>
          )}

        <BriefingReader
          content={briefing.content}
          narrativeId={briefing.id}
          skipMetrics={
            !!(
              structured?.metrics &&
              Object.keys(structured.metrics).length > 0
            )
          }
        />
      </PageContainer>
    </>
  );
}
