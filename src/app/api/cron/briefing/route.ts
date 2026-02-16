import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { runLoggedStage } from "@/lib/pipeline/stage-run";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isSplitPipelineEnabled()) {
    return NextResponse.json({ status: "skipped", reason: "split_jobs_disabled" });
  }

  return runLoggedStage({
    req,
    stage: "briefing",
    lockKey: "briefing",
    lockTtlSeconds: 120,
    execute: () => generateBriefing(),
    invalidateCaches: false,
  });
}
