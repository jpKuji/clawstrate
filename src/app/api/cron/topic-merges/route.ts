import { NextRequest, NextResponse } from "next/server";
import { acquireLock } from "@/lib/redis";
import { proposeSemanticTopicMerges } from "@/lib/topics/semantic-merge";

export const maxDuration = 300;

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

  const release = await acquireLock("topic-merges", 900);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const url = new URL(req.url);
    const limitClusters = Math.min(Number(url.searchParams.get("limit") || 40), 200);
    const result = await proposeSemanticTopicMerges({ limitClusters });
    return NextResponse.json({ status: "completed", ...result });
  } catch (e: any) {
    return NextResponse.json(
      { status: "error", error: e?.message || "unknown" },
      { status: 500 }
    );
  } finally {
    await release();
  }
}

