interface FeedItem {
  time: string;
  type: string;
  message: string;
}

export function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 py-8">
        No recent activity
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800/30 overflow-y-auto max-h-[260px]">
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-[12px]">
          <span className="font-data text-[10px] text-zinc-600 shrink-0">
            {item.time}
          </span>
          <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-cyan)]/70 shrink-0">
            {item.type}
          </span>
          <span className="text-zinc-400 truncate">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
