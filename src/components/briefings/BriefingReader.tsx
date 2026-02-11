"use client";

import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BriefingSection {
  title: string;
  content: string;
  citations?: Array<{
    type: "agent" | "topic" | "action";
    id?: string;
    slug?: string;
    context?: string;
  }>;
}

interface BriefingMetric {
  label: string;
  value: string;
  change?: string;
}

interface BriefingAlert {
  level: "info" | "warning" | "critical";
  message: string;
}

interface StructuredBriefing {
  sections: BriefingSection[];
  metrics?: Record<string, BriefingMetric>;
  alerts?: BriefingAlert[];
  _validationWarnings?: string[];
}

function isStructuredBriefing(content: string): StructuredBriefing | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.sections && Array.isArray(parsed.sections)) {
      return parsed;
    }
  } catch {
    // Not JSON — it's a legacy markdown briefing
  }
  return null;
}

export function BriefingReader({ content }: { content: string }) {
  const structured = isStructuredBriefing(content);

  if (!structured) {
    // Legacy markdown briefing — render as before
    return (
      <article className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200">
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    );
  }

  return <StructuredBriefingView briefing={structured} />;
}

function StructuredBriefingView({ briefing }: { briefing: StructuredBriefing }) {
  return (
    <div className="space-y-6">
      {/* Alerts */}
      {briefing.alerts && briefing.alerts.length > 0 && (
        <div className="space-y-2">
          {briefing.alerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                alert.level === "critical"
                  ? "border-red-800 bg-red-950/50 text-red-300"
                  : alert.level === "warning"
                    ? "border-amber-800 bg-amber-950/50 text-amber-300"
                    : "border-blue-800 bg-blue-950/50 text-blue-300"
              }`}
            >
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Inline Metrics */}
      {briefing.metrics && Object.keys(briefing.metrics).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.values(briefing.metrics).map((metric, i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-zinc-500">{metric.label}</p>
                <p className="text-lg font-bold text-zinc-100">{metric.value}</p>
                {metric.change && (
                  <p className={`text-xs mt-0.5 ${
                    metric.change.startsWith("+") ? "text-emerald-400" :
                    metric.change.startsWith("-") ? "text-red-400" : "text-zinc-400"
                  }`}>
                    {metric.change}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sections */}
      {briefing.sections.map((section, i) => (
        <CollapsibleSection key={i} section={section} defaultOpen={i < 3} />
      ))}

      {/* Validation Warnings (Phase 4.5) */}
      {briefing._validationWarnings && briefing._validationWarnings.length > 0 && (
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
    </div>
  );
}

function CollapsibleSection({
  section,
  defaultOpen,
}: {
  section: BriefingSection;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardTitle className="text-sm text-zinc-200 flex items-center justify-between">
          {section.title}
          <span className="text-zinc-500 text-xs">{isOpen ? "▾" : "▸"}</span>
        </CardTitle>
      </CardHeader>
      {isOpen && (
        <CardContent>
          <article className="prose prose-invert prose-zinc max-w-none prose-sm prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200">
            <ReactMarkdown>{section.content}</ReactMarkdown>
          </article>

          {/* Citations */}
          {section.citations && section.citations.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-zinc-800">
              {section.citations.map((citation, j) => {
                const href =
                  citation.type === "agent"
                    ? `/agents/${encodeURIComponent(citation.id || "")}`
                    : citation.type === "topic"
                      ? `/topics/${encodeURIComponent(citation.slug || "")}`
                      : null;

                return (
                  <Badge
                    key={j}
                    variant="outline"
                    className={`text-xs cursor-pointer ${
                      citation.type === "agent"
                        ? "border-emerald-800 text-emerald-400 hover:bg-emerald-950"
                        : citation.type === "topic"
                          ? "border-blue-800 text-blue-400 hover:bg-blue-950"
                          : "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {href ? (
                      <Link href={href}>
                        {citation.type === "agent" ? `@${citation.id}` : `#${citation.slug}`}
                      </Link>
                    ) : (
                      <span>{citation.id || citation.slug}</span>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
