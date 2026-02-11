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

export function isStructuredBriefing(
  content: string | Record<string, unknown>
): StructuredBriefing | null {
  try {
    // If already an object, use directly
    let parsed: unknown = content;
    if (typeof content === "string") {
      parsed = JSON.parse(content);
      // Handle double-encoding
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as any).sections)
    ) {
      return parsed as StructuredBriefing;
    }
  } catch {
    if (typeof content === "string") {
      try {
        const trimmed = content.replace(/^\uFEFF/, "").trim();
        let parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).sections)) {
          return parsed as StructuredBriefing;
        }
      } catch { /* not JSON */ }
    }
  }
  return null;
}
