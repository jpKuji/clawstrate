import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunsFindMany, mockStageFindMany, mockSelect } = vi.hoisted(() => {
  const mockRunsFindMany = vi.fn();
  const mockStageFindMany = vi.fn();
  const mockSelect = vi.fn();
  return { mockRunsFindMany, mockStageFindMany, mockSelect };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      pipelineRuns: {
        findMany: mockRunsFindMany,
      },
      pipelineStageRuns: {
        findMany: mockStageFindMany,
      },
    },
    select: mockSelect,
  },
}));

import { GET } from "../route";

function chainableSelect(resolveData: unknown[]) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: unknown[]) => void) => resolve(resolveData);
        return () => chain;
      },
    }
  );
  return chain;
}

describe("GET /api/v1/pipeline-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latestByStage and stage lag minutes without N+1 stage querying", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00.000Z"));

    mockRunsFindMany.mockResolvedValueOnce([
      {
        id: "run-2",
        triggerType: "cron",
        status: "completed",
        startedAt: new Date("2026-02-13T11:00:00.000Z"),
        completedAt: new Date("2026-02-13T11:05:00.000Z"),
        error: null,
      },
      {
        id: "run-1",
        triggerType: "cron",
        status: "failed",
        startedAt: new Date("2026-02-13T09:00:00.000Z"),
        completedAt: new Date("2026-02-13T09:04:00.000Z"),
        error: "boom",
      },
    ]);

    mockStageFindMany.mockResolvedValueOnce([
      {
        pipelineRunId: "run-2",
        stage: "ingest",
        status: "completed",
        startedAt: new Date("2026-02-13T11:00:00.000Z"),
        durationMs: 1000,
        error: null,
        result: { postsIngested: 10 },
      },
      {
        pipelineRunId: "run-2",
        stage: "enrich",
        status: "completed",
        startedAt: new Date("2026-02-13T11:01:00.000Z"),
        durationMs: 1000,
        error: null,
        result: { enriched: 10 },
      },
      {
        pipelineRunId: "run-1",
        stage: "ingest",
        status: "failed",
        startedAt: new Date("2026-02-13T09:00:00.000Z"),
        durationMs: 900,
        error: "boom",
        result: null,
      },
    ]);

    mockSelect.mockReturnValueOnce(
      chainableSelect([
        {
          stage: "ingest",
          pipelineRunId: "run-2",
          completedAt: new Date("2026-02-13T11:05:00.000Z"),
          durationMs: 1000,
          result: { postsIngested: 10 },
        },
        {
          stage: "enrich",
          pipelineRunId: "run-2",
          completedAt: new Date("2026-02-13T11:06:00.000Z"),
          durationMs: 1100,
          result: { enriched: 10 },
        },
      ])
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.totalRuns).toBe(2);
    expect(body.summary.recentFailures).toBe(1);
    expect(body.latestByStage.ingest).toMatchObject({
      stage: "ingest",
      pipelineRunId: "run-2",
      minutesSinceLastCompleted: 55,
    });
    expect(body.latestByStage.enrich).toMatchObject({
      stage: "enrich",
      pipelineRunId: "run-2",
      minutesSinceLastCompleted: 54,
    });
    expect(body.latestByStage.analyze).toBeNull();

    expect(mockStageFindMany).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("returns null latestByStage entries when no historical stage completions exist", async () => {
    mockRunsFindMany.mockResolvedValueOnce([]);
    mockStageFindMany.mockResolvedValueOnce([]);
    mockSelect.mockReturnValueOnce(chainableSelect([]));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.health).toBe("healthy");
    expect(body.summary.totalRuns).toBe(0);
    expect(body.latestByStage.ingest).toBeNull();
    expect(body.latestByStage.briefing).toBeNull();
  });
});
