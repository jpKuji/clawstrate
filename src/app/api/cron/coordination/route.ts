import { NextRequest, NextResponse } from "next/server";
import { detectCoordination, detectCommunities } from "@/lib/pipeline/coordination";
import { runLoggedStage } from "@/lib/pipeline/stage-run";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";

export const maxDuration = 300; // 5 minutes max

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSplitPipelineEnabled()) {
    return NextResponse.json({ status: "skipped", reason: "split_jobs_disabled" });
  }

  return runLoggedStage({
    req,
    stage: "coordination",
    lockKey: "coordination",
    lockTtlSeconds: 300,
    execute: async () => {
      const coordResult = await detectCoordination();
      const communityResult = await detectCommunities();
      return {
        ...coordResult,
        communities: communityResult,
      };
    },
  });
}
