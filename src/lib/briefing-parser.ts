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

/**
 * Strip markdown code fences and BOM from content before parsing.
 */
function cleanJsonString(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  // Strip ```json ... ``` or ``` ... ``` wrapping
  s = s.replace(/^```(?:json|JSON)?\s*\n?/m, "").replace(/\n?\s*```\s*$/m, "");
  return s.trim();
}

function tryParseStructured(value: unknown): StructuredBriefing | null {
  // Unwrap double-encoding
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as any).sections)
  ) {
    return parsed as StructuredBriefing;
  }
  return null;
}

export function isStructuredBriefing(
  content: string | Record<string, unknown>
): StructuredBriefing | null {
  // If already an object, check directly
  if (typeof content !== "string") {
    return tryParseStructured(content);
  }

  // Try direct parse
  const direct = tryParseStructured(content);
  if (direct) return direct;

  // Try after stripping code fences / BOM
  const cleaned = cleanJsonString(content);
  if (cleaned !== content) {
    const fromCleaned = tryParseStructured(cleaned);
    if (fromCleaned) return fromCleaned;
  }

  // Try extracting JSON object from within surrounding text
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const extracted = content.slice(jsonStart, jsonEnd + 1);
    const fromExtracted = tryParseStructured(extracted);
    if (fromExtracted) return fromExtracted;
  }

  return null;
}
