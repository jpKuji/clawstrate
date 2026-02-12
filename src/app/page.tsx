import { TerminalPanel } from "@/components/dashboard/TerminalPanel";
import { DashboardMetricStrip } from "@/components/dashboard/DashboardMetricStrip";
import { AlertTicker } from "@/components/dashboard/AlertTicker";
import { DashboardAgentTable } from "@/components/dashboard/DashboardAgentTable";
import { DashboardTopicTable } from "@/components/dashboard/DashboardTopicTable";
import { NetworkMiniMap } from "@/components/dashboard/NetworkMiniMap";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { StatusBar } from "@/components/dashboard/StatusBar";
import { ResizableDashboardGrid } from "@/components/dashboard/ResizableDashboardGrid";
import { BriefingSheet } from "@/components/dashboard/BriefingSheet";
import { SourceActivityStrip } from "@/components/dashboard/SourceActivityStrip";
import { getSourceDisplayList } from "@/lib/sources/display";
import { getEnabledSourceAdapters } from "@/lib/sources";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getDashboard() {
  try {
    const baseUrl = getSiteBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/dashboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getGraphData() {
  try {
    const baseUrl = getSiteBaseUrl();
    const res = await fetch(
      `${baseUrl}/api/v1/graph?maxNodes=25&windowDays=14`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function buildTickerItems(data: any): { type: string; text: string }[] {
  const items: { type: string; text: string }[] = [];

  if (data?.latestBriefing?.title) {
    items.push({
      type: "BRIEFING",
      text: data.latestBriefing.title,
    });
  }

  const topics = data?.topTopics ?? [];
  for (const topic of topics.slice(0, 3)) {
    if ((topic.velocity ?? 0) > 0) {
      items.push({
        type: "TRENDING",
        text: `${topic.name} — ${(topic.velocity ?? 0).toFixed(1)}/hr velocity, ${topic.agentCount ?? 0} agents active`,
      });
    }
  }

  if (items.length === 0) {
    items.push({ type: "STATUS", text: "System online — awaiting data" });
  }

  return items;
}

function buildFeedItems(data: any): { time: string; type: string; message: string }[] {
  const items: { time: string; type: string; message: string }[] = [];
  const now = new Date();

  // Briefing event
  if (data?.latestBriefing) {
    const t = new Date(data.latestBriefing.generatedAt);
    items.push({
      time: t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      type: "BRIEF",
      message: data.latestBriefing.title,
    });
  }

  // Top topic velocity surges
  for (const topic of (data?.topTopics ?? []).slice(0, 4)) {
    if ((topic.velocity ?? 0) > 0) {
      items.push({
        time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        type: "TOPIC",
        message: `${topic.name} velocity ${(topic.velocity ?? 0).toFixed(1)}/hr — ${topic.actionCount ?? 0} actions`,
      });
    }
  }

  // Top agent signals
  for (const agent of (data?.topAgents ?? []).slice(0, 3)) {
    items.push({
      time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      type: "AGENT",
      message: `${agent.displayName} — influence ${(agent.influenceScore ?? 0).toFixed(2)}`,
    });
  }

  return items.slice(0, 8);
}

export default async function DashboardPage() {
  const [data, graphData] = await Promise.all([getDashboard(), getGraphData()]);
  const sourceDisplayList = getSourceDisplayList();
  const activeSources = getEnabledSourceAdapters().length;

  const metrics = [
    {
      label: "Total Actions",
      value: data?.metrics?.totalActions?.current ?? "—",
      change: data?.metrics?.totalActions?.change,
      tooltip: "Cumulative count of all monitored agent actions",
    },
    {
      label: "Total Agents",
      value: data?.metrics?.totalAgents?.current ?? "—",
      change: data?.metrics?.totalAgents?.change,
      tooltip: "Unique AI agents discovered and tracked",
    },
    {
      label: "24h Actions",
      value: data?.metrics?.actionsLast24h?.current ?? "—",
      change: data?.metrics?.actionsLast24h?.change,
      tooltip: "Actions in last 24h vs previous 24h period",
    },
    {
      label: "Net Autonomy",
      value: data?.metrics?.networkAutonomy?.current ?? "—",
      change: data?.metrics?.networkAutonomy?.change,
      tooltip: "Network-wide avg autonomy (0-1). Higher = more independent",
    },
    {
      label: "Net Sentiment",
      value: data?.metrics?.networkSentiment?.current ?? "—",
      change: data?.metrics?.networkSentiment?.change,
      tooltip: "Avg sentiment across recent actions (-1 to +1)",
    },
  ];

  const tickerItems = buildTickerItems(data);
  const feedItems = buildFeedItems(data);

  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      {/* Alert Ticker */}
      <AlertTicker items={tickerItems} />

      {/* Metric Strip */}
      <DashboardMetricStrip
        metrics={metrics}
        briefing={data?.latestBriefing ?? null}
      />

      {/* Source Activity Strip */}
      <SourceActivityStrip
        sourceActivity={data?.sourceActivity ?? []}
        sourceDisplayList={sourceDisplayList}
      />

      {/* Main Grid — Resizable */}
      <ResizableDashboardGrid
        agentsPanel={
          <TerminalPanel
            title="Top Agents"
            href="/agents"
            description="Ranked by influence score, last 24h"
            infoTooltip="Influence = posting frequency + engagement + network centrality"
          >
            <DashboardAgentTable agents={data?.topAgents ?? []} sourceDisplayList={sourceDisplayList} />
          </TerminalPanel>
        }
        topicsPanel={
          <TerminalPanel
            title="Trending Topics"
            href="/topics"
            description="Highest velocity (actions/hour)"
            infoTooltip="Velocity measures the rate of new actions per hour for each topic"
          >
            <DashboardTopicTable topics={data?.topTopics ?? []} />
          </TerminalPanel>
        }
        networkPanel={
          <TerminalPanel
            title="Network"
            href="/network"
            description="Agent interaction graph"
            infoTooltip="Nodes = agents, edges = interactions. Drag to explore, scroll to zoom"
          >
            <NetworkMiniMap
              nodes={graphData?.nodes ?? []}
              edges={graphData?.edges ?? []}
            />
          </TerminalPanel>
        }
        briefingPanel={
          <TerminalPanel
            title="Latest Briefing"
            description="AI-generated intelligence summary"
            infoTooltip="Briefings analyze recent agent activity and surface key patterns"
          >
            <BriefingSheet briefing={data?.latestBriefing ?? null} />
          </TerminalPanel>
        }
        activityPanel={
          <TerminalPanel title="Activity Feed">
            <ActivityFeed items={feedItems} />
          </TerminalPanel>
        }
      />

      {/* Status Bar */}
      <StatusBar
        lastBriefingTime={data?.latestBriefing?.generatedAt ?? null}
        totalActions={data?.metrics?.totalActions?.current ?? 0}
        totalAgents={data?.metrics?.totalAgents?.current ?? 0}
        activeSources={activeSources}
      />
    </div>
  );
}
