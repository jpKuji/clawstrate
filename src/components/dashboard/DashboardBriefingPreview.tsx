interface Briefing {
  id: string;
  title: string;
  summary: string | null;
  generatedAt: string;
  actionsAnalyzed?: number | null;
  agentsActive?: number | null;
}

export function DashboardBriefingPreview({ briefing }: { briefing: Briefing | null }) {
  if (!briefing) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 py-8">
        No briefings generated yet
      </div>
    );
  }

  const timeAgo = getTimeAgo(briefing.generatedAt);

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>{timeAgo}</span>
        {briefing.actionsAnalyzed != null && (
          <span>· {briefing.actionsAnalyzed} actions analyzed</span>
        )}
        {briefing.agentsActive != null && (
          <span>· {briefing.agentsActive} agents</span>
        )}
      </div>
      <h3 className="text-sm font-medium text-zinc-100 line-clamp-2">
        {briefing.title}
      </h3>
      {briefing.summary && (
        <p className="text-[12px] text-zinc-400 line-clamp-3">
          {briefing.summary}
        </p>
      )}
      <p className="text-[10px] text-[var(--accent-cyan)] opacity-70">
        Click to read full briefing →
      </p>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
