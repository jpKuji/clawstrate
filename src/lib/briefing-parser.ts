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
 * Strip markdown code fences, BOM, and surrounding text from JSON content.
 */
function cleanJsonString(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  // Strip ```json ... ``` or ``` ... ``` wrapping
  s = s.replace(/^```(?:json|JSON)?\s*\n?/m, "").replace(/\n?\s*```\s*$/m, "");
  return s.trim();
}

/**
 * Repair common LLM JSON issues that cause JSON.parse to fail:
 * - Trailing commas before } and ]
 * - Single-line // comments
 * - Block comments
 */
export function repairJson(input: string): string {
  let s = input;

  // Remove single-line comments (outside of strings)
  s = s.replace(/\/\/[^\n]*/g, (match, offset) => {
    const before = s.slice(0, offset);
    const quotes = (before.match(/(?<!\\)"/g) || []).length;
    return quotes % 2 === 0 ? "" : match;
  });

  // Remove block comments (outside of strings — simple heuristic)
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove trailing commas before } and ] (the most common LLM JSON issue)
  s = s.replace(/,(\s*[}\]])/g, "$1");

  return s;
}

/**
 * Attempt to complete truncated JSON (e.g. from max_tokens cutoff).
 * Closes any open strings, arrays, and objects so JSON.parse can succeed.
 * Returns the completed string, or the original if it doesn't look truncated.
 */
function completeTruncatedJson(input: string): string {
  // Track nesting state
  let inString = false;
  let escape = false;
  const stack: string[] = []; // tracks open brackets: '{' or '['

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}") { if (stack.length && stack[stack.length - 1] === "{") stack.pop(); }
    else if (ch === "]") { if (stack.length && stack[stack.length - 1] === "[") stack.pop(); }
  }

  // If nothing is open, the JSON is complete (or at least balanced)
  if (!inString && stack.length === 0) return input;

  // Build the completion suffix
  let suffix = "";

  // Close open string
  if (inString) suffix += '"';

  // Close all open brackets in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "{" ? "}" : "]";
  }

  // Clean up: the truncation point may be mid-value (e.g. after a key's colon,
  // after a comma, etc.). Try to make the JSON valid by removing trailing
  // partial tokens before adding closing brackets.
  let base = input;
  if (inString) {
    // We were inside a string — close it
    base = input + '"';
  }

  // Remove any trailing comma or colon before closing brackets
  base = base.replace(/[,:\s]+$/, "");

  // Re-close brackets
  suffix = "";
  // Re-parse state after the base cleanup
  let inStr2 = false;
  let esc2 = false;
  const stack2: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === "\\") { if (inStr2) esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === "{") stack2.push("{");
    else if (ch === "[") stack2.push("[");
    else if (ch === "}") { if (stack2.length && stack2[stack2.length - 1] === "{") stack2.pop(); }
    else if (ch === "]") { if (stack2.length && stack2[stack2.length - 1] === "[") stack2.pop(); }
  }

  for (let i = stack2.length - 1; i >= 0; i--) {
    suffix += stack2[i] === "{" ? "}" : "]";
  }

  return base + suffix;
}

/**
 * Extract the outermost JSON object from a string that may contain
 * surrounding text. Uses bracket balancing instead of simple indexOf/lastIndexOf
 * to handle edge cases correctly.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Fallback: use simple first-{ to last-} if bracket balancing failed
  const end = text.lastIndexOf("}");
  if (end > start) return text.slice(start, end + 1);

  return null;
}

function isValidStructured(value: unknown): value is StructuredBriefing {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as any).sections)
  );
}

function tryParse(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function isStructuredBriefing(
  content: string | Record<string, unknown>
): StructuredBriefing | null {
  // If already an object, check directly
  if (typeof content !== "string") {
    if (isValidStructured(content)) return content as StructuredBriefing;
    return null;
  }

  // Strategy 1: Direct JSON.parse
  const direct = tryParse(content);
  if (isValidStructured(direct)) return direct;
  // Handle double-encoding: JSON.parse returned a string
  if (typeof direct === "string") {
    const inner = tryParse(direct);
    if (isValidStructured(inner)) return inner;
  }

  // Strategy 2: Clean code fences + BOM, then parse
  const cleaned = cleanJsonString(content);
  if (cleaned !== content) {
    const parsed = tryParse(cleaned);
    if (isValidStructured(parsed)) return parsed;
  }

  // Strategy 3: Extract JSON object from surrounding text, then parse
  const extracted = extractJsonObject(cleaned || content);
  if (extracted) {
    const parsed = tryParse(extracted);
    if (isValidStructured(parsed)) return parsed;

    // Strategy 4: Repair common LLM JSON quirks (trailing commas, comments), then parse
    const repaired = repairJson(extracted);
    if (repaired !== extracted) {
      const parsed2 = tryParse(repaired);
      if (isValidStructured(parsed2)) return parsed2;
    }
  }

  // Strategy 5: Repair the full cleaned content and try again
  const fullRepaired = repairJson(cleaned || content);
  const fullParsed = tryParse(fullRepaired);
  if (isValidStructured(fullParsed)) return fullParsed;

  // Strategy 6: Last resort — extract after repair
  const extractedFromRepaired = extractJsonObject(fullRepaired);
  if (extractedFromRepaired) {
    const parsed = tryParse(extractedFromRepaired);
    if (isValidStructured(parsed)) return parsed;
  }

  // Strategy 7: Handle truncated JSON (LLM hit max_tokens)
  // Try to complete the JSON by closing open strings/brackets
  const candidates = [extracted, extractedFromRepaired, fullRepaired, cleaned || content].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const completed = completeTruncatedJson(repairJson(candidate));
    if (completed !== candidate) {
      const parsed = tryParse(completed);
      if (isValidStructured(parsed)) return parsed;
    }
  }

  return null;
}
