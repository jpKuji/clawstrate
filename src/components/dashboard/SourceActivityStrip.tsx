import type { SourceDisplayConfig } from "@/lib/sources/display";

interface SourceActivityItem {
  platformId: string;
  posts: { current: number; change: number };
  comments: { current: number; change: number };
  topOffering: { title: string; replies: number; url: string } | null;
}

function ChangeDelta({ value }: { value: number }) {
  if (value > 0) {
    return <span className="text-emerald-400">(+{value})</span>;
  }
  if (value < 0) {
    return <span className="text-red-400">({value})</span>;
  }
  return <span className="text-zinc-600">(0)</span>;
}

export function SourceActivityStrip({
  sourceActivity,
  sourceDisplayList,
}: {
  sourceActivity: SourceActivityItem[];
  sourceDisplayList: SourceDisplayConfig[];
}) {
  if (sourceActivity.length === 0) return null;

  const displayMap = new Map(sourceDisplayList.map((s) => [s.id, s]));

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px bg-zinc-800"
        style={{
          gridTemplateColumns: `repeat(${sourceActivity.length}, minmax(200px, 1fr))`,
        }}
      >
        {sourceActivity.map((item) => {
          const config = displayMap.get(item.platformId);
          const postLabel = config?.postLabel ?? "Posts";
          const commentLabel = config?.commentLabel ?? "Comments";
          const dotColor = config?.dotColor ?? "bg-zinc-500";
          const displayName = config?.displayName ?? item.platformId;

          return (
            <div
              key={item.platformId}
              className="bg-[var(--panel-bg)] px-3 py-2.5"
            >
              {/* Source header */}
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className={`size-2 rounded-full shrink-0 ${dotColor}`}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {displayName}
                </span>
              </div>

              {/* Metrics row */}
              <div className="flex items-baseline gap-4 mb-1.5">
                <div>
                  <span className="font-data text-sm text-zinc-200">
                    {item.posts.current.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-zinc-500 ml-1">
                    {postLabel}
                  </span>
                  <span className="text-[10px] ml-1">
                    <ChangeDelta value={item.posts.change} />
                  </span>
                </div>
                <div>
                  <span className="font-data text-sm text-zinc-200">
                    {item.comments.current.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-zinc-500 ml-1">
                    {commentLabel}
                  </span>
                  <span className="text-[10px] ml-1">
                    <ChangeDelta value={item.comments.change} />
                  </span>
                </div>
              </div>

              {/* Top offering */}
              {item.topOffering && (
                <div className="text-[10px] text-zinc-500 truncate">
                  <span className="text-zinc-600">
                    Top {postLabel.replace(/s$/, "")}:
                  </span>{" "}
                  <a
                    href={item.topOffering.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-accent transition-colors"
                  >
                    {item.topOffering.title}
                  </a>
                  <span className="text-zinc-600 ml-1">
                    ({item.topOffering.replies})
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
