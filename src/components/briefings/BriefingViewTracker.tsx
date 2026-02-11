"use client";

import { useEffect } from "react";

export function BriefingViewTracker({
  narrativeId,
}: {
  narrativeId: string;
}) {
  useEffect(() => {
    void fetch("/api/v1/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "briefing_view",
        narrativeId,
      }),
    });
  }, [narrativeId]);

  return null;
}
