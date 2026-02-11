"use client";

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BriefingReader } from "@/components/briefings/BriefingReader";
import { DashboardBriefingPreview } from "./DashboardBriefingPreview";

interface Briefing {
  id: string;
  title: string;
  summary: string | null;
  generatedAt: string;
  actionsAnalyzed?: number | null;
  agentsActive?: number | null;
  content?: string | Record<string, unknown> | null;
}

export function BriefingSheet({ briefing }: { briefing: Briefing | null }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = useCallback(async () => {
    if (!briefing) return;
    setOpen(true);
    // Use inline content from dashboard API if available
    if (briefing.content) {
      setContent(briefing.content);
      return;
    }
    if (content) return; // already loaded
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/narratives?id=${briefing.id}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || data.narrative?.content || null);
      }
    } catch {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, [briefing, content]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full text-left h-full"
      >
        <DashboardBriefingPreview briefing={briefing} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[95vw] sm:w-full sm:max-w-2xl overflow-y-auto bg-zinc-950 border-zinc-800"
        >
          <SheetHeader>
            <SheetTitle className="text-zinc-100">
              {briefing?.title ?? "Briefing"}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            {loading ? (
              <div className="space-y-3 py-8">
                <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-zinc-800 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-zinc-800 rounded animate-pulse" />
              </div>
            ) : content ? (
              <BriefingReader content={content} narrativeId={briefing?.id} inDrawer />
            ) : (
              <p className="text-sm text-zinc-500 py-8">
                Unable to load briefing content.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
