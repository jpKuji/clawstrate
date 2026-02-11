"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

interface ProfileSnapshot {
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  snapshotAt: string;
}

interface Action {
  id: string;
  actionType: string;
  title: string | null;
  content: string | null;
  performedAt: string;
  upvotes: number | null;
  enrichment?: {
    sentiment: number | null;
    autonomyScore: number | null;
    intent: string | null;
  } | null;
}

export function AgentProfile({
  agent,
  recentActions,
  profileHistory,
  percentiles,
  egoGraph,
  coordinationFlags,
}: {
  agent: {
    id: string;
    displayName: string;
    description: string | null;
    influenceScore: number | null;
    autonomyScore: number | null;
    activityScore: number | null;
    agentType: string | null;
    totalActions: number | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  recentActions: Action[];
  profileHistory: ProfileSnapshot[];
  percentiles?: {
    influence: number;
    autonomy: number;
    activity: number;
  };
  egoGraph?: {
    outgoing: Array<{ targetId: string; displayName: string; weight: number; count: number }>;
    incoming: Array<{ sourceId: string; displayName: string; weight: number; count: number }>;
  };
  coordinationFlags?: Array<{
    signalType: string;
    confidence: number;
    evidence: string | null;
    detectedAt: string;
  }>;
}) {
  const radarData = [
    { metric: "Influence", value: agent.influenceScore ?? 0 },
    { metric: "Autonomy", value: agent.autonomyScore ?? 0 },
    { metric: "Activity", value: agent.activityScore ?? 0 },
  ];

  const chartData = profileHistory
    .slice()
    .reverse()
    .map((p) => ({
      date: new Date(p.snapshotAt).toLocaleDateString(),
      influence: p.influenceScore ?? 0,
      autonomy: p.autonomyScore ?? 0,
      activity: p.activityScore ?? 0,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{agent.displayName}</h1>
            {agent.description && (
              <p className="text-sm text-zinc-400 mt-1">{agent.description}</p>
            )}
          </div>
          <Badge
            variant="outline"
            className="border-zinc-700 text-zinc-400"
          >
            {agent.agentType || "unknown"}
          </Badge>
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800">
        {[
          { label: "Influence", value: agent.influenceScore, percentile: percentiles?.influence },
          { label: "Autonomy", value: agent.autonomyScore, percentile: percentiles?.autonomy },
          { label: "Activity", value: agent.activityScore, percentile: percentiles?.activity },
          { label: "Total Actions", value: agent.totalActions },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--panel-bg)] p-4">
            <p className="text-[10px] uppercase tracking-widest text-accent">{s.label}</p>
            <p className="text-xl font-bold font-data text-zinc-100 mt-1">
              {typeof s.value === "number" ? s.value.toFixed(2) : s.value ?? 0}
            </p>
            {s.percentile != null && (
              <p className="text-xs text-zinc-500 mt-0.5 font-data">P{s.percentile}</p>
            )}
          </div>
        ))}
      </div>

      {/* Behavioral Fingerprint Radar */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Behavioral Fingerprint</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <ResponsiveContainer width={300} height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#3f3f46" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={{ fill: "#71717a", fontSize: 10 }} />
              <Radar
                dataKey="value"
                stroke="#00e5cc"
                fill="#00e5cc"
                fillOpacity={0.2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Ego Graph — Interaction Partners */}
      {egoGraph && (egoGraph.outgoing.length > 0 || egoGraph.incoming.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {egoGraph.outgoing.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Top Outgoing Interactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {egoGraph.outgoing.map((o) => (
                    <div key={o.targetId} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-200 truncate">{o.displayName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{o.count} interactions</span>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                          w: {o.weight.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {egoGraph.incoming.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Top Incoming Interactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {egoGraph.incoming.map((i) => (
                    <div key={i.sourceId} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-200 truncate">{i.displayName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{i.count} interactions</span>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                          w: {i.weight.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Coordination Flags */}
      {coordinationFlags && coordinationFlags.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Coordination Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {coordinationFlags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-3 border-b border-zinc-800 pb-3 last:border-0">
                  <Badge
                    variant="outline"
                    className={
                      flag.confidence > 0.7
                        ? "border-red-700 text-red-400 text-xs"
                        : flag.confidence > 0.4
                          ? "border-yellow-700 text-yellow-400 text-xs"
                          : "border-zinc-700 text-zinc-400 text-xs"
                    }
                  >
                    {flag.signalType}
                  </Badge>
                  <div className="flex-1">
                    {flag.evidence && (
                      <p className="text-xs text-zinc-400">{flag.evidence}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Confidence: {(flag.confidence * 100).toFixed(0)}% | {new Date(flag.detectedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score History Chart */}
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
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Line type="monotone" dataKey="influence" stroke="#00e5cc" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="autonomy" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activity" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Recent Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActions.map((action) => (
              <div key={action.id} className="border-b border-zinc-800 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                    {action.actionType}
                  </Badge>
                  {action.enrichment?.intent && (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">
                      {action.enrichment.intent}
                    </Badge>
                  )}
                  <span className="text-xs text-zinc-600 ml-auto">
                    {new Date(action.performedAt).toLocaleString()}
                  </span>
                </div>
                {action.title && (
                  <p className="text-sm font-medium text-zinc-200">{action.title}</p>
                )}
                {action.content && (
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {action.content.slice(0, 200)}
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
