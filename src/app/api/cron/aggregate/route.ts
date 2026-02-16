import { NextRequest, NextResponse } from "next/server";
import { runAggregation } from "@/lib/pipeline/aggregate";
import { runLoggedStage } from "@/lib/pipeline/stage-run";
import { isSplitPipelineEnabled } from "@/lib/pipeline/split";

export const maxDuration = 300;

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
    stage: "aggregate",
    lockKey: "aggregate",
    lockTtlSeconds: 300,
    execute: () => runAggregation(),
  });
}
