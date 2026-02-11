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
    let parsed = typeof content === "string" ? JSON.parse(content) : content;
    // Handle double-encoding
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.sections)) {
      return parsed as StructuredBriefing;
    }
  } catch {
    // Try trimming BOM/whitespace
    try {
      const trimmed = (content as string).replace(/^\uFEFF/, "").trim();
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed?.sections && Array.isArray(parsed.sections)) {
        return parsed as StructuredBriefing;
      }
    } catch { /* not JSON */ }
  }
  return null;
}
