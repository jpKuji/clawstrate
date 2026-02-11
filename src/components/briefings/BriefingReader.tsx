"use client";

import ReactMarkdown from "react-markdown";
import { useMemo } from "react";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { AlertBanner } from "@/components/briefings/AlertBanner";
import { MetricStrip } from "@/components/briefings/MetricStrip";
import { CitationChip } from "@/components/briefings/CitationChip";
import { MobileSectionNav } from "@/components/briefings/MobileSectionNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  StructuredBriefing,
  BriefingSection,
} from "@/lib/briefing-parser";
import { isStructuredBriefing } from "@/lib/briefing-parser";

export function BriefingReader({
  content,
  narrativeId,
  skipMetrics,
  inDrawer,
}: {
  content: string | Record<string, unknown>;
  narrativeId?: string;
  skipMetrics?: boolean;
  inDrawer?: boolean;
}) {
  const structured = isStructuredBriefing(content);

  if (!structured) {
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <article className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200">
        <ReactMarkdown>{text}</ReactMarkdown>
      </article>
    );
  }

  return (
    <StructuredBriefingView
      briefing={structured}
      narrativeId={narrativeId}
      skipMetrics={skipMetrics}
      inDrawer={inDrawer}
    />
  );
}

function StructuredBriefingView({
  briefing,
  narrativeId,
  skipMetrics,
  inDrawer,
}: {
  briefing: StructuredBriefing;
  narrativeId?: string;
  skipMetrics?: boolean;
  inDrawer?: boolean;
}) {
  const sectionIds = useMemo(
    () => briefing.sections.map((_, i) => `section-${i}`),
    [briefing.sections]
  );

  const activeId = useScrollSpy(sectionIds);

  const sectionNav = useMemo(
    () =>
      briefing.sections.map((s, i) => ({
        id: `section-${i}`,
        title: s.title,
      })),
    [briefing.sections]
  );

  const trackEvent = (
    eventType: string,
    metadata?: Record<string, unknown>
  ) => {
    void fetch("/api/v1/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, narrativeId, metadata }),
    });
  };

  // Sort alerts: critical first, then warning, then info
  const sortedAlerts = useMemo(() => {
    if (!briefing.alerts) return [];
    const order = { critical: 0, warning: 1, info: 2 };
    return [...briefing.alerts].sort(
      (a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3)
    );
  }, [briefing.alerts]);

  return (
    <div className="space-y-8">
      {/* Alerts */}
      {sortedAlerts.length > 0 && (
        <div className="space-y-2">
          {sortedAlerts.map((alert, i) => (
            <AlertBanner
              key={i}
              level={alert.level}
              message={alert.message}
              onInteract={() =>
                trackEvent("alert_interaction", {
                  level: alert.level,
                  message: alert.message,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Metrics (skip if already rendered at page level) */}
      {!skipMetrics &&
        briefing.metrics &&
        Object.keys(briefing.metrics).length > 0 && (
          <MetricStrip metrics={briefing.metrics} compact={inDrawer} />
        )}

      {/* Compact inline section nav for drawer mode */}
      {inDrawer && sectionNav.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {sectionNav.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs border transition-colors ${
                activeId === section.id
                  ? "border-[var(--accent-cyan)]/60 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
              }`}
            >
              {section.title}
            </a>
          ))}
        </div>
      )}

      {/* Sidebar TOC + Sections layout */}
      {inDrawer ? (
        <div className="space-y-0">
          {briefing.sections.map((section, i) => (
            <SectionBlock
              key={i}
              section={section}
              index={i}
              isFirst={i === 0}
            />
          ))}
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-20">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                Sections
              </p>
              <div className="space-y-0.5">
                {sectionNav.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`block border-l-2 py-1.5 pl-3 text-sm transition-colors ${
                      activeId === section.id
                        ? "border-[var(--accent-cyan)] text-zinc-100"
                        : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    {section.title}
                  </a>
                ))}
              </div>
            </nav>
          </aside>

          {/* Sections */}
          <div className="space-y-0">
            {briefing.sections.map((section, i) => (
              <SectionBlock
                key={i}
                section={section}
                index={i}
                isFirst={i === 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Validation Warnings */}
      {briefing._validationWarnings &&
        briefing._validationWarnings.length > 0 && (
          <Card className="bg-zinc-900 border-amber-800/50">
            <CardHeader>
              <CardTitle className="text-xs text-amber-400">
                Validation Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {briefing._validationWarnings.map((warning, i) => (
                  <li key={i} className="text-xs text-amber-300/70">
                    {warning}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

      {/* Mobile section nav (hidden in drawer — uses inline nav instead) */}
      {!inDrawer && <MobileSectionNav sections={sectionNav} activeId={activeId} />}
    </div>
  );
}

function SectionBlock({
  section,
  index,
  isFirst,
}: {
  section: BriefingSection;
  index: number;
  isFirst: boolean;
}) {
  const num = String(index + 1).padStart(2, "0");

  return (
    <div id={`section-${index}`} className="scroll-mt-20">
      {/* Numbered gradient divider */}
      {!isFirst && (
        <div className="flex items-center gap-4 py-8">
          <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
          <span className="text-xs font-mono text-zinc-600 shrink-0">
            {num}
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-zinc-800 to-transparent" />
        </div>
      )}

      {/* Section title */}
      <h2 className="text-xl md:text-2xl font-bold text-zinc-100 mb-4">
        {isFirst && (
          <span className="text-xs font-mono text-zinc-600 mr-3">{num}</span>
        )}
        {section.title}
      </h2>

      {/* Prose content */}
      <article className="prose prose-invert prose-zinc max-w-none text-[15px] leading-relaxed prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200 prose-blockquote:border-l-[var(--accent-cyan)]/40 prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:text-zinc-300 prose-code:bg-zinc-800/60 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
        <ReactMarkdown>{section.content}</ReactMarkdown>
      </article>

      {/* Citations */}
      {section.citations && section.citations.length > 0 && (
        <div className="mt-5 pt-4 border-t border-zinc-800/50">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            References
          </p>
          <div className="flex flex-wrap gap-2">
            {section.citations.map((citation, j) => (
              <CitationChip
                key={j}
                type={citation.type}
                id={citation.id}
                agentId={citation.agentId}
                label={citation.label}
                slug={citation.slug}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
