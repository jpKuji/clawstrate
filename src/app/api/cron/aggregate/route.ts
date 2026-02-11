import { NextRequest, NextResponse } from "next/server";
import { runAggregation } from "@/lib/pipeline/aggregate";
import { acquireLock, invalidateApiCaches } from "@/lib/redis";

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

  const release = await acquireLock("aggregate", 300);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const result = await runAggregation();
    await invalidateApiCaches();
    return NextResponse.json({ status: "completed", ...result });
  } catch (e: any) {
    return NextResponse.json(
      { status: "error", error: e.message },
      { status: 500 }
    );
  } finally {
    await release();
  }
}
