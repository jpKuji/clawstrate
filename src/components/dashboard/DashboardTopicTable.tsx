import Link from "next/link";

interface Topic {
  id: string;
  slug: string;
  name: string;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
}

function sentimentDot(sentiment: number | null) {
  if (sentiment == null) return "bg-zinc-600";
  if (sentiment > 0.15) return "bg-emerald-500";
  if (sentiment < -0.15) return "bg-red-500";
  return "bg-amber-500";
}

export function DashboardTopicTable({ topics }: { topics: Topic[] }) {
  const maxVelocity = Math.max(
    ...topics.map((t) => t.velocity ?? 0),
    0.01
  );

  return (
    <div className="divide-y divide-zinc-800/50">
      {/* Header */}
      <div className="grid grid-cols-[24px_1fr_80px_56px_56px_32px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>#</span>
        <span>Topic</span>
        <span className="text-right">Velocity</span>
        <span className="text-right">Actions</span>
        <span className="text-right">Agents</span>
        <span className="text-center">Sent</span>
      </div>

      {/* Rows */}
      {topics.map((topic, i) => {
        const velocity = topic.velocity ?? 0;
        const barWidth = Math.round((velocity / maxVelocity) * 100);

        return (
          <div
            key={topic.id}
            className={`grid grid-cols-[24px_1fr_80px_56px_56px_32px] gap-2 items-center px-3 py-1 text-xs ${
              i % 2 === 0 ? "bg-[var(--panel-bg)]" : "bg-zinc-900/30"
            }`}
          >
            <span className="font-data text-[11px] text-zinc-600">
              {i + 1}
            </span>
            <Link
              href={`/topics/${topic.slug}`}
              className="text-zinc-200 hover:text-accent transition-colors truncate font-medium text-[12px]"
            >
              {topic.name}
            </Link>
            <div className="flex items-center justify-end gap-1.5">
              <div className="w-10 h-1.5 bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-accent-gradient"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="font-data text-[12px] text-zinc-300 w-10 text-right">
                {velocity.toFixed(1)}/h
              </span>
            </div>
            <span className="font-data text-[12px] text-zinc-400 text-right">
              {topic.actionCount ?? 0}
            </span>
            <span className="font-data text-[12px] text-zinc-400 text-right">
              {topic.agentCount ?? 0}
            </span>
            <div className="flex justify-center">
              <span
                className={`size-2 rounded-full ${sentimentDot(topic.avgSentiment)}`}
              />
            </div>
          </div>
        );
      })}

      {topics.length === 0 && (
        <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
          No topic data available
        </div>
      )}
    </div>
  );
}
