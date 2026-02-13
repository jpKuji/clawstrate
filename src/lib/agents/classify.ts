export type ActorKind = "ai" | "human";
export type SourceProfileType = "forum_ai" | "marketplace_ai";

export interface RentAHumanRoleCounts {
  bountyPosts: number;
  assignmentComments: number;
}

export interface RentAHumanActorClassification {
  actorKind: ActorKind;
  isMixedRole: boolean;
}

const GENERIC_RENTAHUMAN_NAMES = new Set([
  "",
  "user",
  "unknown",
  "anonymous",
]);

function normalizeDisplayName(name: string | null | undefined): string {
  return (name || "").trim().replace(/\s+/g, " ");
}

export function classifyRentAHumanActor(
  counts: RentAHumanRoleCounts
): RentAHumanActorClassification {
  const hasAssignments = counts.assignmentComments > 0;
  const hasBounties = counts.bountyPosts > 0;

  if (hasAssignments && !hasBounties) {
    return { actorKind: "human", isMixedRole: false };
  }

  if (hasAssignments && hasBounties) {
    return { actorKind: "ai", isMixedRole: true };
  }

  return { actorKind: "ai", isMixedRole: false };
}

export function actorKindFromRawProfile(rawProfile: unknown): ActorKind | null {
  if (!rawProfile || typeof rawProfile !== "object") return null;
  const value = (rawProfile as Record<string, unknown>).actorKind;
  return value === "ai" || value === "human" ? value : null;
}

export function resolveActorKind(
  kinds: Array<ActorKind | null | undefined>
): ActorKind {
  if (kinds.some((kind) => kind === "ai")) return "ai";
  if (kinds.some((kind) => kind === "human")) return "human";
  return "ai";
}

export function sourceProfileTypeFromPlatforms(platformIds: string[]): SourceProfileType {
  return platformIds.includes("rentahuman") ? "marketplace_ai" : "forum_ai";
}

export function isGenericRentAHumanName(name: string | null | undefined): boolean {
  const normalized = normalizeDisplayName(name).toLowerCase();
  return GENERIC_RENTAHUMAN_NAMES.has(normalized);
}

export function shortPlatformUserId(platformUserId: string | null | undefined): string {
  const normalized = (platformUserId || "").trim();
  if (!normalized) return "unknown";
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function formatAgentDisplayLabel(params: {
  displayName: string | null | undefined;
  platformId: string | null | undefined;
  platformUserId: string | null | undefined;
}): string {
  const normalizedDisplayName = normalizeDisplayName(params.displayName);

  if (
    params.platformId === "rentahuman" &&
    isGenericRentAHumanName(normalizedDisplayName)
  ) {
    return `User • ${shortPlatformUserId(params.platformUserId)}`;
  }

  if (normalizedDisplayName) return normalizedDisplayName;
  return shortPlatformUserId(params.platformUserId);
}

export function mergeActorKindIntoRawProfile(
  rawProfile: Record<string, unknown> | null | undefined,
  classification: RentAHumanActorClassification
): Record<string, unknown> {
  return {
    ...(rawProfile || {}),
    actorKind: classification.actorKind,
    isMixedRole: classification.isMixedRole,
  };
}
