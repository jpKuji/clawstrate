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
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getBriefing(id: string) {
  try {
    const baseUrl = getSiteBaseUrl();
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
      <Icon className="size-4 text-zinc-600" />
      <span className="text-zinc-500">{label}:</span>
      <span className="text-zinc-200 font-data font-medium">{value}</span>
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
      <PageContainer backHref="/briefings" backLabel="All briefings">
        <BriefingViewTracker narrativeId={briefing.id} />

        {/* Hero header */}
        <header className="mb-8 border border-zinc-800 bg-zinc-900 p-5">
          {/* Type pill + relative time */}
          <div className="flex items-center gap-3 mb-4">
            <BriefingTypePill type={briefing.type} />
            <span className="text-xs text-zinc-500 font-data">{timeAgo}</span>
          </div>

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-100 mb-3">
            {briefing.title}
          </h1>

          {/* Summary */}
          {briefing.summary && (
            <p className="text-sm text-zinc-400 max-w-3xl mb-5">
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

        <div className="border border-zinc-800 bg-[var(--panel-bg)] p-5">
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
        </div>
      </PageContainer>
    </>
  );
}
