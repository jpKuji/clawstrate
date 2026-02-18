"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface OnchainEventItem {
  id: string;
  actionType: string;
  title: string | null;
  content: string | null;
  performedAt: string;
  txHash: string;
  chainId: number;
  standard: string;
  topics: string[];
}

interface CounterpartyItem {
  address: string;
  role: string;
  count: number;
}

interface ProfileHistoryPoint {
  snapshotAt: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
}

export function OnchainAgentProfile({
  agent,
  onchainMetrics,
  recentEvents,
  profileHistory,
  counterpartyActivity,
}: {
  agent: {
    id: string;
    displayName: string;
    displayLabel?: string;
    description: string | null;
    influenceScore: number | null;
    autonomyScore: number | null;
    activityScore: number | null;
    agentType: string | null;
    totalActions: number | null;
    firstSeenAt: string;
    lastSeenAt: string;
    metadata?: Record<string, unknown>;
  };
  onchainMetrics: {
    feedbacks: number;
    validations: number;
    uniqueCounterparties: number;
    protocols: string[];
    x402Supported: boolean | null;
    parseStatus: string | null;
  };
  recentEvents: OnchainEventItem[];
  profileHistory: ProfileHistoryPoint[];
  counterpartyActivity: CounterpartyItem[];
}) {
  const chartData = profileHistory
    .slice()
    .reverse()
    .map((point) => ({
      date: new Date(point.snapshotAt).toLocaleDateString(),
      influence: point.influenceScore ?? 0,
      autonomy: point.autonomyScore ?? 0,
      activity: point.activityScore ?? 0,
    }));

  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {agent.displayLabel || agent.displayName}
            </h1>
            {agent.description && (
              <p className="mt-1 text-sm text-zinc-400">{agent.description}</p>
            )}
            <p className="mt-2 text-xs text-zinc-500 font-data">{agent.id}</p>
          </div>
          <Badge variant="outline" className="border-fuchsia-700 text-fuchsia-400">
            onchain_ai
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800">
        {[
          { label: "Influence", value: (agent.influenceScore ?? 0).toFixed(2) },
          { label: "Autonomy", value: (agent.autonomyScore ?? 0).toFixed(2) },
          { label: "Activity", value: (agent.activityScore ?? 0).toFixed(2) },
          { label: "Events", value: agent.totalActions ?? 0 },
        ].map((metric) => (
          <div key={metric.label} className="bg-[var(--panel-bg)] p-4">
            <p className="text-[10px] uppercase tracking-widest text-accent">{metric.label}</p>
            <p className="mt-1 font-data text-xl font-bold text-zinc-100">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Onchain Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between"><span className="text-zinc-500">Feedbacks</span><span>{onchainMetrics.feedbacks}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Validations</span><span>{onchainMetrics.validations}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Unique counterparties</span><span>{onchainMetrics.uniqueCounterparties}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">x402 support</span><span>{onchainMetrics.x402Supported == null ? "unknown" : onchainMetrics.x402Supported ? "yes" : "no"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Metadata parse</span><span>{onchainMetrics.parseStatus || "unknown"}</span></div>
            <div>
              <p className="text-zinc-500 mb-1">Protocols</p>
              <div className="flex flex-wrap gap-1">
                {onchainMetrics.protocols.length === 0 ? (
                  <span className="text-xs text-zinc-500">No protocol tags</span>
                ) : (
                  onchainMetrics.protocols.map((protocol) => (
                    <Badge key={protocol} variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                      {protocol}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Counterparty Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {counterpartyActivity.length === 0 ? (
              <p className="text-sm text-zinc-500">No counterparties yet</p>
            ) : (
              <div className="space-y-2 text-sm">
                {counterpartyActivity.map((item) => (
                  <div key={`${item.address}:${item.role}`} className="flex items-center justify-between">
                    <span className="text-zinc-300 font-data truncate mr-3">{item.address}</span>
                    <span className="text-zinc-500 text-xs">{item.role} · {item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {chartData.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
                <Line type="monotone" dataKey="influence" stroke="#00e5cc" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="autonomy" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activity" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No linked events yet</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div key={event.id} className="border-b border-zinc-800 pb-3 last:border-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                      {event.standard}
                    </Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">
                      {event.actionType}
                    </Badge>
                    <span className="text-xs text-zinc-600 ml-auto">{new Date(event.performedAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-zinc-200">{event.title || event.actionType}</p>
                  <p className="text-xs text-zinc-500 mt-1 font-data break-all">{event.txHash}</p>
                  {event.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {event.topics.slice(0, 5).map((slug) => (
                        <Badge key={`${event.id}:${slug}`} variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                          {slug}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
