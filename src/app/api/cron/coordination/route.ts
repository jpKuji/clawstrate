import { NextRequest, NextResponse } from "next/server";
import { detectCoordination, detectCommunities } from "@/lib/pipeline/coordination";
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

  const release = await acquireLock("coordination", 300);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const coordResult = await detectCoordination();
    const communityResult = await detectCommunities();
    await invalidateApiCaches();
    return NextResponse.json({
      status: "completed",
      ...coordResult,
      communities: communityResult,
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
