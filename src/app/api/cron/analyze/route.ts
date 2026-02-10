import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/lib/pipeline/analyze";
import { acquireLock } from "@/lib/redis";

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

  const release = await acquireLock("analyze", 300);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const result = await runAnalysis();
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
