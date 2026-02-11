"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from "recharts";

const COLORS = ["#00e5cc", "#3b82f6", "#10b981", "#ec4899"];

interface AgentData {
  agent: {
    id: string;
    displayName: string;
    influenceScore: number | null;
    autonomyScore: number | null;
    activityScore: number | null;
    agentType: string | null;
    totalActions: number | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  profileHistory: Array<{
    influenceScore: number | null;
    autonomyScore: number | null;
    activityScore: number | null;
    snapshotAt: string;
  }>;
  recentActions: Array<{
    id: string;
    actionType: string;
    title: string | null;
    performedAt: string;
  }>;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const [agentsData, setAgentsData] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const agentIds =
    searchParams
      .get("agents")
      ?.split(",")
      .filter(Boolean)
      .slice(0, 4) || [];

  useEffect(() => {
    if (agentIds.length < 2) {
      setError(
        "Please provide at least 2 agent IDs in the URL (?agents=id1,id2)"
      );
      setLoading(false);
      return;
    }

    Promise.all(
      agentIds.map((id) =>
        fetch(`/api/v1/agents/${id}`).then((r) => {
          if (!r.ok) throw new Error(`Agent ${id} not found`);
          return r.json();
        })
      )
    )
      .then(setAgentsData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [searchParams]);

  if (loading)
    return <div className="text-zinc-400">Loading agents...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (agentsData.length < 2)
    return (
      <div className="text-zinc-400">Need at least 2 agents to compare</div>
    );

  // Build radar chart data
  const radarData = [
    {
      metric: "Influence",
      ...Object.fromEntries(
        agentsData.map((d, i) => [`agent${i}`, d.agent.influenceScore ?? 0])
      ),
    },
    {
      metric: "Autonomy",
      ...Object.fromEntries(
        agentsData.map((d, i) => [`agent${i}`, d.agent.autonomyScore ?? 0])
      ),
    },
    {
      metric: "Activity",
      ...Object.fromEntries(
        agentsData.map((d, i) => [`agent${i}`, d.agent.activityScore ?? 0])
      ),
    },
  ];

  // Build combined score history
  const allDates = new Set<string>();
  for (const data of agentsData) {
    for (const p of data.profileHistory) {
      allDates.add(new Date(p.snapshotAt).toLocaleDateString());
    }
  }

  const sortedDates = Array.from(allDates).sort();
  const historyData = sortedDates.map((date) => {
    const point: Record<string, unknown> = { date };
    for (let i = 0; i < agentsData.length; i++) {
      const snapshot = agentsData[i].profileHistory.find(
        (p) => new Date(p.snapshotAt).toLocaleDateString() === date
      );
      point[`influence_${i}`] = snapshot?.influenceScore ?? null;
      point[`autonomy_${i}`] = snapshot?.autonomyScore ?? null;
    }
    return point;
  });

  return (
    <div className="space-y-6">
      {/* Agent headers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {agentsData.map((data, i) => (
          <Card
            key={data.agent.id}
            className="bg-zinc-900 border-zinc-800 border-t-2"
            style={{ borderTopColor: COLORS[i] }}
          >
            <CardContent className="pt-4">
              <p className="text-sm font-bold text-zinc-100">
                {data.agent.displayName}
              </p>
              <Badge
                variant="outline"
                className="border-zinc-700 text-zinc-400 text-xs mt-1"
              >
                {data.agent.agentType || "unknown"}
              </Badge>
              <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] sm:text-xs">
                <div>
                  <p className="text-zinc-500">Influence</p>
                  <p className="text-zinc-200 font-medium">
                    {(data.agent.influenceScore ?? 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Autonomy</p>
                  <p className="text-zinc-200 font-medium">
                    {(data.agent.autonomyScore ?? 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Actions</p>
                  <p className="text-zinc-200 font-medium">
                    {data.agent.totalActions ?? 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar comparison */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
            Score Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#a1a1aa", fontSize: 12 }}
              />
              <PolarRadiusAxis domain={[0, 1]} tick={false} />
              {agentsData.map((data, i) => (
                <Radar
                  key={data.agent.id}
                  name={data.agent.displayName}
                  dataKey={`agent${i}`}
                  stroke={COLORS[i]}
                  fill={COLORS[i]}
                  fillOpacity={0.1}
                />
              ))}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Score history overlay */}
      {historyData.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
              Influence History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={historyData}>
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                <YAxis
                  stroke="#52525b"
                  fontSize={10}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
                {agentsData.map((data, i) => (
                  <Line
                    key={data.agent.id}
                    type="monotone"
                    dataKey={`influence_${i}`}
                    stroke={COLORS[i]}
                    strokeWidth={2}
                    dot={false}
                    name={data.agent.displayName}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <PageContainer
      title="Agent Comparison"
      description="Compare behavioral profiles across agents"
    >
      <Suspense fallback={<div className="text-zinc-400">Loading...</div>}>
        <CompareContent />
      </Suspense>
    </PageContainer>
  );
}
