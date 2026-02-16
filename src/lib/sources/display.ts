import { getSourceAdapters } from "@/lib/sources";

export interface SourceDisplayConfig {
  id: string;
  displayName: string;
  shortLabel: string;
  color: string;
  dotColor: string;
  postLabel: string;
  commentLabel: string;
  sourceType: "forum" | "marketplace" | "onchain";
  actorKinds: ("ai" | "human")[];
  description: string;
}

const SOURCE_COLORS = [
  { color: "border-teal-700 text-teal-400", dotColor: "bg-teal-500" },
  { color: "border-violet-700 text-violet-400", dotColor: "bg-violet-500" },
  { color: "border-amber-700 text-amber-400", dotColor: "bg-amber-500" },
  { color: "border-rose-700 text-rose-400", dotColor: "bg-rose-500" },
  { color: "border-sky-700 text-sky-400", dotColor: "bg-sky-500" },
  { color: "border-emerald-700 text-emerald-400", dotColor: "bg-emerald-500" },
  { color: "border-orange-700 text-orange-400", dotColor: "bg-orange-500" },
  { color: "border-pink-700 text-pink-400", dotColor: "bg-pink-500" },
  { color: "border-cyan-700 text-cyan-400", dotColor: "bg-cyan-500" },
  { color: "border-lime-700 text-lime-400", dotColor: "bg-lime-500" },
];

const SHORT_LABEL_OVERRIDES: Record<string, string> = {
  moltbook: "MB",
  rentahuman: "RAH",
};

const ACTION_LABEL_OVERRIDES: Record<
  string,
  { postLabel: string; commentLabel: string }
> = {
  rentahuman: { postLabel: "Bounties", commentLabel: "Assigned" },
};

const SOURCE_TYPE_OVERRIDES: Record<string, { sourceType: "forum" | "marketplace"; actorKinds: ("ai" | "human")[]; description: string }> = {
  moltbook: {
    sourceType: "forum",
    actorKinds: ["ai"],
    description: "AI-native forum — posts and comments from autonomous agents",
  },
  rentahuman: {
    sourceType: "marketplace",
    actorKinds: ["ai", "human"],
    description: "AI-to-human marketplace — bounties posted by AI, assigned to humans",
  },
};

function defaultShortLabel(displayName: string): string {
  const upper = displayName.replace(/[^A-Z]/g, "");
  if (upper.length >= 2) return upper.slice(0, 3);
  return displayName.slice(0, 2).toUpperCase();
}

const ONCHAIN_SOURCE_CONFIG: SourceDisplayConfig = {
  id: "onchain",
  displayName: "EVM Onchain",
  shortLabel: "EVM",
  color: "border-fuchsia-700 text-fuchsia-400",
  dotColor: "bg-fuchsia-500",
  postLabel: "Events",
  commentLabel: "Agents",
  sourceType: "onchain",
  actorKinds: ["ai"],
  description: "ERC-8004 and related EVM standards across Ethereum, Base, Arbitrum, Optimism, Polygon",
};

export function getSourceDisplayMap(): Map<string, SourceDisplayConfig> {
  const adapters = getSourceAdapters();
  const map = new Map<string, SourceDisplayConfig>();

  adapters.forEach((adapter, index) => {
    const palette = SOURCE_COLORS[index % SOURCE_COLORS.length];
    const actionLabels = ACTION_LABEL_OVERRIDES[adapter.id] ?? {
      postLabel: "Posts",
      commentLabel: "Comments",
    };

    const sourceTypeConfig = SOURCE_TYPE_OVERRIDES[adapter.id] ?? {
      sourceType: "forum" as const,
      actorKinds: ["ai" as const],
      description: "Source platform",
    };

    map.set(adapter.id, {
      id: adapter.id,
      displayName: adapter.displayName,
      shortLabel:
        SHORT_LABEL_OVERRIDES[adapter.id] ??
        defaultShortLabel(adapter.displayName),
      color: palette.color,
      dotColor: palette.dotColor,
      ...actionLabels,
      ...sourceTypeConfig,
    });
  });

  map.set(ONCHAIN_SOURCE_CONFIG.id, ONCHAIN_SOURCE_CONFIG);

  return map;
}

export function getSourceDisplay(id: string): SourceDisplayConfig | undefined {
  return getSourceDisplayMap().get(id);
}

export function formatSourceLabel(id: string): string {
  if (id === "all") return "All sources";
  return getSourceDisplay(id)?.displayName ?? id;
}

export function getSourceDisplayList(): SourceDisplayConfig[] {
  return Array.from(getSourceDisplayMap().values());
}
