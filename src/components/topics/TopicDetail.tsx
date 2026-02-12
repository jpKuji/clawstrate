"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TopicAction {
  action: {
    id: string;
    title: string | null;
    content: string | null;
    url: string | null;
    actionType: string;
    performedAt: string;
    upvotes: number | null;
  };
  agentName: string | null;
  agentId: string | null;
  autonomyScore: number | null;
  sentiment: number | null;
  isSubstantive: boolean | null;
  intent: string | null;
}

interface Topic {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
}

interface CooccurringTopic {
  slug: string;
  name: string;
  count: number | null;
}

interface TopContributor {
  agentId: string | null;
  agentName: string | null;
  actionCount: number;
}

function cleanContent(raw: string): string {
  return raw.replace(/\{[^{}]*\}/g, "").replace(/\s{2,}/g, " ").trim();
}

export function TopicDetail({
  topic,
  recentActions,
  cooccurringTopics,
  topContributors,
}: {
  topic: Topic;
  recentActions: TopicAction[];
  cooccurringTopics?: CooccurringTopic[];
  topContributors?: TopContributor[];
}) {
  // Compute sentiment distribution histogram
  const sentimentBuckets = [
    { range: "-1.0 to -0.6", min: -1.0, max: -0.6, count: 0 },
    { range: "-0.6 to -0.2", min: -0.6, max: -0.2, count: 0 },
    { range: "-0.2 to 0.2", min: -0.2, max: 0.2, count: 0 },
    { range: "0.2 to 0.6", min: 0.2, max: 0.6, count: 0 },
    { range: "0.6 to 1.0", min: 0.6, max: 1.0, count: 0 },
  ];

  for (const item of recentActions) {
    if (item.sentiment != null) {
      for (const bucket of sentimentBuckets) {
        if (item.sentiment >= bucket.min && item.sentiment < bucket.max) {
          bucket.count++;
          break;
        }
        // Handle exactly 1.0
        if (item.sentiment === 1.0 && bucket.max === 1.0) {
          bucket.count++;
          break;
        }
      }
    }
  }

  // Activity timeline (group by day)
  const dailyActivity = new Map<string, number>();
  for (const item of recentActions) {
    const day = new Date(item.action.performedAt).toLocaleDateString();
    dailyActivity.set(day, (dailyActivity.get(day) || 0) + 1);
  }
  const activityData = Array.from(dailyActivity.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 bg-zinc-900 p-4">
        <h1 className="text-xl font-bold text-zinc-100">{topic.name}</h1>
        <p className="text-xs text-zinc-500 mt-1 font-data">/{topic.slug}</p>
        {topic.description && (
          <p className="text-sm text-zinc-400 mt-2">{topic.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800">
        {[
          { label: "Velocity", value: `${(topic.velocity ?? 0).toFixed(2)}/hr` },
          { label: "Actions", value: topic.actionCount ?? 0 },
          { label: "Agents", value: topic.agentCount ?? 0 },
          { label: "Avg Sentiment", value: topic.avgSentiment != null ? topic.avgSentiment.toFixed(2) : "\u2014" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--panel-bg)] p-4">
            <p className="text-[10px] uppercase tracking-widest text-accent">{s.label}</p>
            <p className="text-xl font-bold font-data text-zinc-100 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Sentiment Distribution */}
      {sentimentBuckets.some((b) => b.count > 0) && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
              Sentiment Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={sentimentBuckets}>
                <XAxis
                  dataKey="range"
                  stroke="#52525b"
                  fontSize={10}
                  tick={{ fill: "#71717a" }}
                />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Bar
                  dataKey="count"
                  fill="#00e5cc"
                  radius={[2, 2, 0, 0]}
                  activeBar={{ fillOpacity: 0.5 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      {activityData.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={activityData}>
                <XAxis
                  dataKey="day"
                  stroke="#52525b"
                  fontSize={10}
                  tick={{ fill: "#71717a" }}
                />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Contributors */}
        {topContributors && topContributors.length > 0 && (
          <Card className={`bg-zinc-900 border-zinc-800${!cooccurringTopics?.length ? " lg:col-span-2" : ""}`}>
            <CardHeader>
              <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topContributors.map((contributor, i) => (
                  <div
                    key={contributor.agentId || i}
                    className="flex items-center justify-between"
                  >
                    <Link
                      href={`/agents/${contributor.agentId}`}
                      className="text-sm text-zinc-200 hover:text-zinc-100"
                    >
                      {contributor.agentName || "Unknown"}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {contributor.actionCount} actions
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Co-occurring Topics */}
        {cooccurringTopics && cooccurringTopics.length > 0 && (
          <Card className={`bg-zinc-900 border-zinc-800${!topContributors?.length ? " lg:col-span-2" : ""}`}>
            <CardHeader>
              <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
                Related Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {cooccurringTopics.map((ct) => (
                  <Link
                    key={ct.slug}
                    href={`/topics/${ct.slug}`}
                    className="inline-block"
                  >
                    <Badge
                      variant="outline"
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                    >
                      {ct.name}
                      <span className="ml-1 text-zinc-500">
                        ({ct.count})
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Recent Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActions.map((item) => (
              <div key={item.action.id} className="border-b border-zinc-800 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                    {item.action.actionType}
                  </Badge>
                  {item.intent && (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">
                      {item.intent}
                    </Badge>
                  )}
                  {item.agentName && (
                    <Link
                      href={`/agents/${item.agentId}`}
                      className="text-xs text-zinc-300 hover:text-zinc-100"
                    >
                      {item.agentName}
                    </Link>
                  )}
                  <span className="text-xs text-zinc-600 ml-auto flex items-center gap-2">
                    {item.sentiment != null && (
                      <span
                        className={
                          item.sentiment > 0.3
                            ? "text-accent"
                            : item.sentiment < -0.3
                              ? "text-red-500"
                              : "text-zinc-500"
                        }
                      >
                        {item.sentiment > 0 ? "+" : ""}
                        {item.sentiment.toFixed(2)}
                      </span>
                    )}
                    {new Date(item.action.performedAt).toLocaleString()}
                  </span>
                </div>
                {item.action.title && (
                  <p className="text-sm font-medium text-zinc-200">
                    {item.action.url ? (
                      <a
                        href={item.action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent transition-colors"
                      >
                        {item.action.title}
                      </a>
                    ) : (
                      item.action.title
                    )}
                  </p>
                )}
                {item.action.content && cleanContent(item.action.content) && (
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {cleanContent(item.action.content).slice(0, 200)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
