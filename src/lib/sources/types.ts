import type { SourceMethodology } from "@/lib/methodology/types";

export interface NormalizedAction {
  sourceAdapterId: string;
  platformId: string;
  platformActionId: string;
  actionType: "post" | "comment" | "reply";
  title: string | null;
  content: string | null;
  url: string | null;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  performedAt: Date;
  // Agent info (for upsert)
  // Stable per-platform actor identifier (prevents cross-user merges on same display name).
  authorPlatformUserId: string;
  // Human-friendly actor label.
  authorDisplayName: string;
  authorDescription: string | null;
  authorKarma: number | null;
  // Community info
  communityName: string | null;
  communityDisplayName: string | null;
  // Parent tracking
  parentPlatformActionId: string | null;
  // Raw data
  rawData: Record<string, unknown>;
  // Actor kind — "ai" (default) or "human"
  actorKind?: "ai" | "human";
}

export interface SourceIngestionResult {
  actions: NormalizedAction[];
  postsFetched: number;
  commentsFetched: number;
  errors: string[];
}

export interface SourceAdapter {
  id: string;
  platformId: string;
  displayName: string;
  methodology: SourceMethodology;
  isEnabled: () => boolean;
  ingest: () => Promise<SourceIngestionResult>;
}
