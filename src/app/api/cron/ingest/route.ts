import { NextRequest, NextResponse } from "next/server";
import { runIngestion } from "@/lib/pipeline/ingest";
import { acquireLock } from "@/lib/redis";

export const maxDuration = 120; // 2 minutes max

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Acquire distributed lock (prevent overlapping runs)
  const release = await acquireLock("ingest", 120);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const result = await runIngestion();
    return NextResponse.json({
      status: "completed",
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: "error", error: e.message },
      { status: 500 }
    );
  } finally {
    await release();
  }
}
