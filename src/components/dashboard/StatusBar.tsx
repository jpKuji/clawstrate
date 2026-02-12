export function StatusBar({
  lastBriefingTime,
  totalActions,
  totalAgents,
  activeSources,
}: {
  lastBriefingTime: string | null;
  totalActions: number;
  totalAgents: number;
  activeSources?: number;
}) {
  return (
    <div className="flex items-center divide-x divide-zinc-800 border-t border-zinc-800 bg-zinc-950 h-7 text-[10px] font-data uppercase tracking-wider overflow-x-auto">
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-zinc-500">Pipeline Active</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <span className="text-zinc-600">Last Briefing</span>
        <span className="text-zinc-400">
          {lastBriefingTime
            ? new Date(lastBriefingTime).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>
      {activeSources != null && (
        <div className="flex items-center gap-1.5 px-3 shrink-0">
          <span className="text-zinc-600">Sources</span>
          <span className="text-zinc-400">{activeSources}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <span className="text-zinc-600">Actions</span>
        <span className="text-zinc-400">{totalActions.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <span className="text-zinc-600">Agents</span>
        <span className="text-zinc-400">{totalAgents.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 ml-auto shrink-0">
        <span className="text-zinc-600">CLAWSTRATE</span>
        <span className="text-zinc-500">v1.0</span>
      </div>
    </div>
  );
}
