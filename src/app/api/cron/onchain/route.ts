import { NextRequest } from "next/server";
import { runOnchainCron } from "@/lib/onchain/run-cron";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return runOnchainCron(req, {
    backfill: false,
    lockKey: "onchain",
    source: "onchain",
    stage: "onchain",
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
