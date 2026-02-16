import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/pipeline/ingest", () => ({ runIngestion: vi.fn() }));
vi.mock("@/lib/pipeline/enrich", () => ({ runEnrichment: vi.fn() }));
vi.mock("@/lib/redis", () => ({
  acquireLock: vi.fn(),
  invalidateApiCaches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pipeline/stage-run", () => ({
  runLoggedStage: vi.fn(),
}));
vi.mock("@/lib/pipeline/split", () => ({
  isSplitPipelineEnabled: vi.fn().mockReturnValue(false),
}));

import { GET as ingestHandler } from "@/app/api/cron/ingest/route";
import { GET as enrichHandler } from "@/app/api/cron/enrich/route";
import { GET as analyzeHandler } from "@/app/api/cron/analyze/route";
import { GET as briefingHandler } from "@/app/api/cron/briefing/route";

import { runIngestion } from "@/lib/pipeline/ingest";
import { runEnrichment } from "@/lib/pipeline/enrich";
import { acquireLock } from "@/lib/redis";
import { runLoggedStage } from "@/lib/pipeline/stage-run";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";

const CRON_SECRET = process.env.CRON_SECRET!;

function makeRequest(path: string, authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("Cron Routes", () => {
  const mockRelease = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSplitPipelineEnabled).mockReturnValue(false);
  });

  it("ingest route validates auth and lock semantics", async () => {
    const unauthorized = await ingestHandler(makeRequest("/api/cron/ingest"));
    expect(unauthorized.status).toBe(401);

    vi.mocked(acquireLock).mockResolvedValueOnce(null);
    const skipped = await ingestHandler(makeRequest("/api/cron/ingest", `Bearer ${CRON_SECRET}`));
    expect((await skipped.json()).reason).toBe("already running");

    vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
    vi.mocked(runIngestion).mockResolvedValueOnce({ postsIngested: 1, commentsIngested: 0, errors: [] });
    const completed = await ingestHandler(makeRequest("/api/cron/ingest", `Bearer ${CRON_SECRET}`));
    expect(completed.status).toBe(200);
    expect((await completed.json()).status).toBe("completed");
    expect(acquireLock).toHaveBeenCalledWith("ingest", 120);
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("enrich route validates auth and lock semantics", async () => {
    const unauthorized = await enrichHandler(makeRequest("/api/cron/enrich"));
    expect(unauthorized.status).toBe(401);

    vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
    vi.mocked(runEnrichment).mockResolvedValueOnce({ enriched: 2, errors: [] });
    const completed = await enrichHandler(makeRequest("/api/cron/enrich", `Bearer ${CRON_SECRET}`));
    expect(completed.status).toBe(200);
    expect((await completed.json()).status).toBe("completed");
    expect(acquireLock).toHaveBeenCalledWith("enrich", 300);
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("analyze route skips when split jobs are disabled", async () => {
    vi.mocked(isSplitPipelineEnabled).mockReturnValue(false);

    const response = await analyzeHandler(makeRequest("/api/cron/analyze", `Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "skipped",
      reason: "split_jobs_disabled",
    });
    expect(runLoggedStage).not.toHaveBeenCalled();
  });

  it("briefing route delegates to logged stage runner when split jobs are enabled", async () => {
    vi.mocked(isSplitPipelineEnabled).mockReturnValue(true);
    vi.mocked(runLoggedStage).mockResolvedValueOnce(
      NextResponse.json({ status: "completed", narrativeId: "narrative-1" })
    );

    const response = await briefingHandler(makeRequest("/api/cron/briefing", `Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "completed", narrativeId: "narrative-1" });
    expect(runLoggedStage).toHaveBeenCalledOnce();
  });
});
