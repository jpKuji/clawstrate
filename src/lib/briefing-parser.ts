export interface BriefingSection {
  title: string;
  content: string;
  citations?: Array<{
    type: "agent" | "topic" | "action";
    id?: string;
    agentId?: string;
    label?: string;
    slug?: string;
    context?: string;
  }>;
}

export interface BriefingMetric {
  label: string;
  value: string;
  change?: string;
}

export interface BriefingAlert {
  level: "info" | "warning" | "critical";
  message: string;
}

export interface StructuredBriefing {
  sections: BriefingSection[];
  metrics?: Record<string, BriefingMetric>;
  alerts?: BriefingAlert[];
  _validationWarnings?: string[];
}

export function isStructuredBriefing(content: string): StructuredBriefing | null {
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
