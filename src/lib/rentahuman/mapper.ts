import type { NormalizedAction } from "@/lib/sources/types";
import type { RentAHumanBounty, RentAHumanHuman } from "./types";

interface MapperOptions {
  sourceAdapterId?: string;
  platformId?: string;
}

function parseDateOr(
  iso: unknown,
  fallback: Date
): Date {
  if (typeof iso === "string") {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

export function mapBountyToPost(
  bounty: RentAHumanBounty,
  options: MapperOptions = {}
): NormalizedAction {
  const sourceAdapterId = options.sourceAdapterId ?? "rentahuman";
  const platformId = options.platformId ?? "rentahuman";
  const performedAt = parseDateOr(bounty.createdAt, new Date());
  const authorPlatformUserId = bounty.agentId || `unknown:${bounty.id}`;
  const authorDisplayName = bounty.agentName || "unknown";

  return {
    sourceAdapterId,
    platformId,
    platformActionId: `bounty_${bounty.id}`,
    actionType: "post",
    title: bounty.title ?? null,
    content: bounty.description ?? null,
    url: `https://rentahuman.ai/bounties/${bounty.id}`,
    upvotes: Number(bounty.upvoteCount ?? 0) || 0,
    downvotes: Number(bounty.downvoteCount ?? 0) || 0,
    replyCount: Number(bounty.applicationCount ?? 0) || 0,
    performedAt,
    authorPlatformUserId,
    authorDisplayName,
    authorDescription: null,
    authorKarma: null,
    communityName: bounty.category ?? null,
    communityDisplayName: bounty.category ?? null,
    parentPlatformActionId: null,
    rawData: { kind: "bounty", ...(bounty as unknown as Record<string, unknown>) },
    actorKind: "ai",
  };
}

export function mapAssignmentToComment(
  bounty: RentAHumanBounty,
  human: RentAHumanHuman,
  humanId: string,
  options: MapperOptions = {}
): NormalizedAction {
  const sourceAdapterId = options.sourceAdapterId ?? "rentahuman";
  const platformId = options.platformId ?? "rentahuman";
  const now = new Date();
  const performedAt = parseDateOr(bounty.updatedAt, parseDateOr(bounty.createdAt, now));

  return {
    sourceAdapterId,
    platformId,
    platformActionId: `assignment_${bounty.id}_${humanId}`,
    actionType: "comment",
    title: null,
    content: "ASSIGNED",
    url: null,
    upvotes: 0,
    downvotes: 0,
    replyCount: 0,
    performedAt,
    authorPlatformUserId: humanId,
    authorDisplayName: human.name || humanId,
    authorDescription: human.headline || null,
    authorKarma: null,
    communityName: null,
    communityDisplayName: null,
    parentPlatformActionId: `bounty_${bounty.id}`,
    rawData: {
      kind: "assignment",
      bountyId: bounty.id,
      humanId,
      bookingIds: bounty.bookingIds ?? [],
    },
    actorKind: "human",
    authorRawProfile: {
      actorKind: "human",
      name: human.name,
      headline: human.headline,
      bio: human.bio,
      skills: human.skills,
      expertise: human.expertise,
      languages: human.languages,
      location: human.location,
      hourlyRate: human.hourlyRate,
      currency: human.currency,
      rating: human.rating,
      reviewCount: human.reviewCount,
      totalBookings: human.totalBookings,
      isVerified: human.isVerified,
      isAvailable: human.isAvailable,
      avatarUrl: human.avatarUrl,
    },
  };
}
