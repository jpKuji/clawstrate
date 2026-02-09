"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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
}) {
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{agent.displayName}</h1>
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

      {/* Score Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Influence", value: agent.influenceScore },
          { label: "Autonomy", value: agent.autonomyScore },
          { label: "Activity", value: agent.activityScore },
          { label: "Total Actions", value: agent.totalActions },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <p className="text-xs text-zinc-400">{s.label}</p>
              <p className="text-xl font-bold text-zinc-100">
                {typeof s.value === "number" ? s.value.toFixed(2) : s.value ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Score History Chart */}
      {chartData.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-400">Score History</CardTitle>
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
                <Line type="monotone" dataKey="influence" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="autonomy" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activity" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">Recent Actions</CardTitle>
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
