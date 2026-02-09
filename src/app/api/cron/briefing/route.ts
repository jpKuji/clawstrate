import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "@/lib/pipeline/briefing";
import { acquireLock } from "@/lib/redis";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await acquireLock("briefing", 120);
  if (!release) {
    return NextResponse.json({ status: "skipped", reason: "already running" });
  }

  try {
    const result = await generateBriefing();
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
