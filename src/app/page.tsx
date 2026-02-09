import { PageContainer } from "@/components/layout/PageContainer";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BriefingSummary } from "@/components/dashboard/BriefingSummary";
import { AgentTable } from "@/components/agents/AgentTable";
import { TopicTable } from "@/components/topics/TopicTable";

export const revalidate = 60;

async function getDashboard() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/dashboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const data = await getDashboard();

  return (
    <PageContainer title="Dashboard" description="AI agent behavioral intelligence overview">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard
          title="Total Actions"
          value={data?.metrics?.totalActions ?? "\u2014"}
        />
        <MetricCard
          title="Total Agents"
          value={data?.metrics?.totalAgents ?? "\u2014"}
        />
        <MetricCard
          title="Actions (24h)"
          value={data?.metrics?.actionsLast24h ?? "\u2014"}
        />
        <MetricCard
          title="Network Autonomy"
          value={data?.metrics?.networkAutonomy ?? "\u2014"}
        />
        <MetricCard
          title="Network Sentiment"
          value={data?.metrics?.networkSentiment ?? "\u2014"}
        />
      </div>

      {/* Latest Briefing */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Latest Briefing</h2>
        <BriefingSummary briefing={data?.latestBriefing ?? null} />
      </div>

      {/* Top Agents + Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Top Agents</h2>
          <AgentTable agents={data?.topAgents ?? []} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Trending Topics</h2>
          <TopicTable topics={data?.topTopics ?? []} />
        </div>
      </div>
    </PageContainer>
  );
}
