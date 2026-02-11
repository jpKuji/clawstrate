import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordProductEvent } from "@/lib/telemetry";

const telemetrySchema = z.object({
  accountId: z.string().trim().min(1).optional(),
  eventType: z.enum([
    "briefing_view",
    "alert_interaction",
    "watchlist_add",
    "watchlist_remove",
  ]),
  narrativeId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = telemetrySchema.parse(body);

    const accountIdFromHeader = req.headers.get("x-account-id") || undefined;
    const result = await recordProductEvent({
      ...parsed,
      accountId: parsed.accountId || accountIdFromHeader,
    });

    return NextResponse.json({
      status: "ok",
      eventId: result.eventId,
      quota: result.quota,
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: e.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to record telemetry", details: e.message },
      { status: 500 }
    );
  }
}
