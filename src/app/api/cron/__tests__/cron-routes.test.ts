import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock pipeline functions
vi.mock("@/lib/pipeline/ingest", () => ({
  runIngestion: vi.fn(),
}));
vi.mock("@/lib/pipeline/enrich", () => ({
  runEnrichment: vi.fn(),
}));
vi.mock("@/lib/pipeline/analyze", () => ({
  runAnalysis: vi.fn(),
}));
vi.mock("@/lib/pipeline/briefing", () => ({
  generateBriefing: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
  acquireLock: vi.fn(),
}));

import { GET as ingestHandler } from "@/app/api/cron/ingest/route";
import { GET as enrichHandler } from "@/app/api/cron/enrich/route";
import { GET as analyzeHandler } from "@/app/api/cron/analyze/route";
import { GET as briefingHandler } from "@/app/api/cron/briefing/route";

import { runIngestion } from "@/lib/pipeline/ingest";
import { runEnrichment } from "@/lib/pipeline/enrich";
import { runAnalysis } from "@/lib/pipeline/analyze";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { acquireLock } from "@/lib/redis";

const CRON_SECRET = process.env.CRON_SECRET!;

function makeRequest(path: string, authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers.authorization = authHeader;
  }
  return new NextRequest(`http://localhost${path}`, { headers });
}

interface CronRouteConfig {
  name: string;
  path: string;
  handler: (req: NextRequest) => Promise<Response>;
  pipelineFn: ReturnType<typeof vi.fn>;
  lockKey: string;
  lockTTL: number;
}

const routes: CronRouteConfig[] = [
  {
    name: "ingest",
    path: "/api/cron/ingest",
    handler: ingestHandler,
    pipelineFn: runIngestion as ReturnType<typeof vi.fn>,
    lockKey: "ingest",
    lockTTL: 120,
  },
  {
    name: "enrich",
    path: "/api/cron/enrich",
    handler: enrichHandler,
    pipelineFn: runEnrichment as ReturnType<typeof vi.fn>,
    lockKey: "enrich",
    lockTTL: 300,
  },
  {
    name: "analyze",
    path: "/api/cron/analyze",
    handler: analyzeHandler,
    pipelineFn: runAnalysis as ReturnType<typeof vi.fn>,
    lockKey: "analyze",
    lockTTL: 300,
  },
  {
    name: "briefing",
    path: "/api/cron/briefing",
    handler: briefingHandler,
    pipelineFn: generateBriefing as ReturnType<typeof vi.fn>,
    lockKey: "briefing",
    lockTTL: 120,
  },
];

describe("Cron Routes", () => {
  const mockRelease = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const route of routes) {
    describe(`/api/cron/${route.name}`, () => {
      it("returns 401 when authorization header is missing", async () => {
        const req = makeRequest(route.path);
        const res = await route.handler(req);
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
      });

      it("returns 401 when authorization header has wrong secret", async () => {
        const req = makeRequest(route.path, "Bearer wrong-secret");
        const res = await route.handler(req);
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
      });

      it('returns "skipped" when lock cannot be acquired', async () => {
        vi.mocked(acquireLock).mockResolvedValueOnce(null);

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        const res = await route.handler(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("skipped");
        expect(body.reason).toBe("already running");
      });

      it('returns "completed" with result data on success', async () => {
        const mockResult = { processed: 10 };
        vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
        route.pipelineFn.mockResolvedValueOnce(mockResult);

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        const res = await route.handler(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("completed");
        expect(body.processed).toBe(10);
      });

      it("returns 500 with error message when pipeline throws", async () => {
        vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
        route.pipelineFn.mockRejectedValueOnce(new Error("Pipeline failed"));

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        const res = await route.handler(req);
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.status).toBe("error");
        expect(body.error).toBe("Pipeline failed");
      });

      it("releases lock in finally block even on error", async () => {
        vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
        route.pipelineFn.mockRejectedValueOnce(new Error("boom"));

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        await route.handler(req);

        expect(mockRelease).toHaveBeenCalledOnce();
      });

      it("releases lock after successful execution", async () => {
        vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
        route.pipelineFn.mockResolvedValueOnce({});

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        await route.handler(req);

        expect(mockRelease).toHaveBeenCalledOnce();
      });

      it(`uses lock key "${route.lockKey}" with TTL ${route.lockTTL}`, async () => {
        vi.mocked(acquireLock).mockResolvedValueOnce(mockRelease);
        route.pipelineFn.mockResolvedValueOnce({});

        const req = makeRequest(route.path, `Bearer ${CRON_SECRET}`);
        await route.handler(req);

        expect(acquireLock).toHaveBeenCalledWith(route.lockKey, route.lockTTL);
      });
    });
  }
});
