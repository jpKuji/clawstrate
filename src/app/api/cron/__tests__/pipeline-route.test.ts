import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockDb: {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  query: {
    pipelineStageRuns: { findFirst: ReturnType<typeof vi.fn> };
  };
};

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/pipeline/ingest", () => ({ runIngestion: vi.fn() }));
vi.mock("@/lib/pipeline/enrich", () => ({ runEnrichment: vi.fn() }));
vi.mock("@/lib/pipeline/analyze", () => ({ runAnalysis: vi.fn() }));
vi.mock("@/lib/pipeline/aggregate", () => ({ runAggregation: vi.fn() }));
vi.mock("@/lib/pipeline/coordination", () => ({
  detectCoordination: vi.fn(),
  detectCommunities: vi.fn(),
}));
vi.mock("@/lib/pipeline/briefing", () => ({ generateBriefing: vi.fn() }));
vi.mock("@/lib/redis", () => ({
  acquireLock: vi.fn(),
  invalidateApiCaches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pipeline/split", () => ({
  isSplitPipelineEnabled: vi.fn().mockReturnValue(false),
}));

import { GET } from "@/app/api/cron/pipeline/route";
import { runIngestion } from "@/lib/pipeline/ingest";
import { runEnrichment } from "@/lib/pipeline/enrich";
import { runAnalysis } from "@/lib/pipeline/analyze";
import { runAggregation } from "@/lib/pipeline/aggregate";
import { detectCoordination, detectCommunities } from "@/lib/pipeline/coordination";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { acquireLock } from "@/lib/redis";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";

function createInsertChain(terminal: unknown) {
  const chain: any = {};
  chain.values = () => chain;
  chain.onConflictDoNothing = () => chain;
  chain.onConflictDoUpdate = () => chain;
  chain.returning = () => Promise.resolve(terminal);
  return chain;
}

function createUpdateChain() {
  const chain: any = {};
  chain.set = () => chain;
  chain.where = () => Promise.resolve([]);
  return chain;
}

function makeRequest(path: string, authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("GET /api/cron/pipeline", () => {
  const mockRelease = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    let insertCalls = 0;
    mockDb = {
      insert: vi.fn(() => {
        insertCalls += 1;
        if (insertCalls === 1) {
          return createInsertChain([{ id: "run-1" }]);
        }
        return createInsertChain([{ id: `stage-${insertCalls}`, durationMs: 0 }]);
      }),
      update: vi.fn(() => createUpdateChain()),
      query: {
        pipelineStageRuns: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    vi.mocked(acquireLock).mockResolvedValue(mockRelease);
    vi.mocked(isSplitPipelineEnabled).mockReturnValue(false);
    vi.mocked(runIngestion).mockResolvedValue({ postsIngested: 1, commentsIngested: 1, errors: [] });
    vi.mocked(runEnrichment).mockResolvedValue({ enriched: 1, errors: [] });
    vi.mocked(runAnalysis).mockResolvedValue({ agentsUpdated: 1, topicsUpdated: 1 });
    vi.mocked(runAggregation).mockResolvedValue({ agentsAggregated: 1, topicsAggregated: 1 });
    vi.mocked(detectCoordination).mockResolvedValue({ signalsDetected: 0, errors: [] });
    vi.mocked(detectCommunities).mockResolvedValue({ communitiesFound: 1, agentsLabeled: 2 });
    vi.mocked(generateBriefing).mockResolvedValue({ narrativeId: "narrative-1" });
  });

  it("skips downstream stages when an upstream stage fails", async () => {
    vi.mocked(runEnrichment).mockRejectedValueOnce(new Error("enrichment failed"));

    const req = makeRequest("/api/cron/pipeline", `Bearer ${process.env.CRON_SECRET}`);
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("failed");

    const statuses = Object.fromEntries(
      (body.stages as Array<{ stage: string; status: string }>).map((s) => [s.stage, s.status])
    );
    expect(statuses.ingest).toBe("completed");
    expect(statuses.enrich).toBe("failed");
    expect(statuses.analyze).toBe("skipped");
    expect(statuses.aggregate).toBe("skipped");
    expect(statuses.coordination).toBe("skipped");
    expect(statuses.briefing).toBe("skipped");

    expect(runAnalysis).not.toHaveBeenCalled();
    expect(runAggregation).not.toHaveBeenCalled();
    expect(detectCoordination).not.toHaveBeenCalled();
    expect(generateBriefing).not.toHaveBeenCalled();
    expect(acquireLock).toHaveBeenCalledWith("pipeline", 330);
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("runs all stages in legacy mode when no stage fails", async () => {
    const req = makeRequest("/api/cron/pipeline", `Bearer ${process.env.CRON_SECRET}`);
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.stages).toHaveLength(6);
    expect(runIngestion).toHaveBeenCalledOnce();
    expect(runEnrichment).toHaveBeenCalledOnce();
    expect(runAnalysis).toHaveBeenCalledOnce();
    expect(runAggregation).toHaveBeenCalledOnce();
    expect(detectCoordination).toHaveBeenCalledOnce();
    expect(detectCommunities).toHaveBeenCalledOnce();
    expect(generateBriefing).toHaveBeenCalledOnce();
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("delegates heavy stages when split mode is enabled", async () => {
    vi.mocked(isSplitPipelineEnabled).mockReturnValue(true);

    const req = makeRequest("/api/cron/pipeline", `Bearer ${process.env.CRON_SECRET}`);
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");

    const stageByName = Object.fromEntries(
      (body.stages as Array<{ stage: string; status: string; result?: { reason?: string } }>).map(
        (stage) => [stage.stage, stage]
      )
    );

    expect(stageByName.ingest.status).toBe("completed");
    expect(stageByName.enrich.status).toBe("completed");
    expect(stageByName.analyze.status).toBe("skipped");
    expect(stageByName.analyze.result?.reason).toBe("delegated_to_split_schedule");
    expect(stageByName.aggregate.status).toBe("skipped");
    expect(stageByName.coordination.status).toBe("skipped");
    expect(stageByName.briefing.status).toBe("skipped");

    expect(runAnalysis).not.toHaveBeenCalled();
    expect(runAggregation).not.toHaveBeenCalled();
    expect(detectCoordination).not.toHaveBeenCalled();
    expect(generateBriefing).not.toHaveBeenCalled();
  });
});
