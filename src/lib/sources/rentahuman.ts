import { getRentAHumanClient } from "../rentahuman/client";
import type { RentAHumanBounty, RentAHumanHuman } from "../rentahuman/types";
import {
  mapBountyToPost,
  mapAssignmentToComment,
} from "../rentahuman/mapper";
import type { NormalizedAction, SourceAdapter, SourceIngestionResult } from "./types";

function envInt(name: string, defaultValue: number, opts?: { min?: number; max?: number }) {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : defaultValue;
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.POSITIVE_INFINITY;
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

export const rentahumanSourceAdapter: SourceAdapter = {
  id: "rentahuman",
  platformId: "rentahuman",
  displayName: "RentAHuman.ai",
  methodology: {
    id: "rentahuman",
    displayName: "RentAHuman.ai",
    status: "active",
    coverageSummary:
      "Ingests public marketplace activity (bounties) and derives relationship edges from assignment signals.",
    ingestionBehavior: [
      "Fetches newest bounties via cursor pagination and de-duplicates by bounty id.",
      "Maps each bounty to a canonical 'post' action and uses category as community.",
      "Derives assignment comment actions for assignedHumanIds to create interaction edges against the bounty poster.",
    ],
    identityModel:
      "Canonical identities are keyed by (platform_id, platform_user_id). RentAHuman requires stable platform user IDs to avoid merging posters with identical display names.",
    knownLimitations: [
      "The global human directory is intentionally not crawled due to scale; only referenced humans are resolved.",
      "Assignment actions are derived signals; they may not perfectly reflect platform-side timestamps.",
    ],
    sourceSpecificMetrics: [
      { label: "Bounty ingest budget", value: "Up to RENTAHUMAN_BOUNTIES_MAX (default 200) per run" },
      { label: "Assignment expansion", value: "Up to RENTAHUMAN_ASSIGNMENT_BOUNTY_MAX (default 50) bounties per run" },
    ],
  },
  isEnabled: () => true,
  ingest: ingestRentAHuman,
};

async function ingestRentAHuman(): Promise<SourceIngestionResult> {
  const client = getRentAHumanClient();
  const errors: string[] = [];

  const bountyMax = envInt("RENTAHUMAN_BOUNTIES_MAX", 200, { min: 0, max: 2000 });
  const assignmentBountyMax = envInt("RENTAHUMAN_ASSIGNMENT_BOUNTY_MAX", 50, { min: 0, max: 500 });
  const bountiesStatus = process.env.RENTAHUMAN_BOUNTIES_STATUS || undefined;

  const bountyById = new Map<string, RentAHumanBounty>();
  let cursor: string | undefined = undefined;

  while (bountyById.size < bountyMax) {
    const remaining = bountyMax - bountyById.size;
    const limit = Math.max(1, Math.min(100, remaining));
    try {
      const resp = await client.listBounties({ limit, cursor, status: bountiesStatus });
      for (const bounty of resp.bounties || []) {
        if (bounty?.id) bountyById.set(bounty.id, bounty);
      }
      if (!resp.hasMore) break;
      if (!resp.nextCursor) break;
      cursor = resp.nextCursor;
    } catch (e: any) {
      errors.push(`bounties: ${e.message}`);
      break;
    }
  }

  const bounties = [...bountyById.values()];

  const actions: NormalizedAction[] = [];
  for (const bounty of bounties) {
    actions.push(
      mapBountyToPost(bounty, { sourceAdapterId: "rentahuman", platformId: "rentahuman" })
    );
  }

  // Resolve humans for assignment edges
  const humansCache = new Map<string, RentAHumanHuman>();
  const bountiesWithAssignments = bounties
    .filter((b) => Array.isArray(b.assignedHumanIds) && b.assignedHumanIds.length > 0)
    .slice(0, assignmentBountyMax);

  let assignmentComments = 0;
  for (const bounty of bountiesWithAssignments) {
    const humanIds = (bounty.assignedHumanIds || []).filter(Boolean);
    for (const humanId of humanIds) {
      try {
        let human = humansCache.get(humanId);
        if (!human) {
          const resp = await client.getHuman(humanId);
          human = resp.human;
          humansCache.set(humanId, human);
        }
        actions.push(
          mapAssignmentToComment(bounty, human, humanId, {
            sourceAdapterId: "rentahuman",
            platformId: "rentahuman",
          })
        );
        assignmentComments++;
      } catch (e: any) {
        errors.push(`human ${humanId} for bounty ${bounty.id}: ${e.message}`);
      }
    }
  }

  return {
    actions,
    postsFetched: bounties.length,
    commentsFetched: assignmentComments,
    errors,
  };
}
