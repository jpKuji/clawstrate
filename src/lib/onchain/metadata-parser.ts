import { gunzipSync } from "node:zlib";

interface ParsedMetadataResult {
  name: string | null;
  description: string | null;
  protocols: string[];
  x402Supported: boolean | null;
  serviceEndpointsJson: Record<string, unknown>;
  crossChainJson: Record<string, unknown>[];
  parseStatus: "success" | "partial" | "error";
  fieldSources: Record<string, unknown>;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

function compactReason(input: unknown, maxLen: number = 280): string {
  const raw = input instanceof Error ? input.message : String(input ?? "unknown_error");
  const sanitized = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (sanitized.length <= maxLen) return sanitized;
  return `${sanitized.slice(0, maxLen)}...`;
}

function parseDataUriPayload(uri: string): Record<string, unknown> {
  const comma = uri.indexOf(",");
  if (comma <= 5) {
    throw new Error("invalid_data_uri");
  }

  const meta = uri.slice(5, comma).toLowerCase();
  const body = uri.slice(comma + 1);
  const isBase64 = meta.includes(";base64");
  const isGzip = meta.includes("enc=gzip") || meta.includes(";gzip");

  const rawBytes = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");
  const jsonBytes = isGzip ? gunzipSync(rawBytes) : rawBytes;
  const text = jsonBytes.toString("utf8");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_metadata_payload");
  }
  return parsed as Record<string, unknown>;
}

function parsePayloadFields(payload: Record<string, unknown>): ParsedMetadataResult {
  const protocols = Array.isArray(payload.protocols)
    ? payload.protocols.filter((v): v is string => typeof v === "string")
    : [];

  const endpoints = (payload.endpoints ?? payload.services ?? payload.serviceEndpoints ?? {}) as
    | Record<string, unknown>
    | undefined;

  const crossChain = arrayOfObjects(payload.crossChainRegistrations ?? payload.cross_chain ?? []);

  const status: "success" | "partial" | "error" =
    safeString(payload.name) || safeString(payload.description) || protocols.length > 0
      ? "success"
      : "partial";

  return {
    name: safeString(payload.name),
    description: safeString(payload.description),
    protocols,
    x402Supported:
      typeof payload.x402Supported === "boolean"
        ? payload.x402Supported
        : typeof payload.x402_supported === "boolean"
          ? payload.x402_supported
          : null,
    serviceEndpointsJson: endpoints && typeof endpoints === "object" ? endpoints : {},
    crossChainJson: crossChain,
    parseStatus: status,
    fieldSources: {
      source: "agent_uri",
      hasName: !!safeString(payload.name),
      hasDescription: !!safeString(payload.description),
      protocolCount: protocols.length,
    },
  };
}

export async function parseAgentMetadataFromUri(uri: string): Promise<ParsedMetadataResult> {
  try {
    if (uri.startsWith("data:")) {
      const payload = parseDataUriPayload(uri);
      return parsePayloadFields(payload);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(uri, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return {
        name: null,
        description: null,
        protocols: [],
        x402Supported: null,
        serviceEndpointsJson: {},
        crossChainJson: [],
        parseStatus: "error",
        fieldSources: {
          source: "agent_uri",
          reason: `http_${res.status}`,
        },
      };
    }

    const payload = (await res.json()) as Record<string, unknown>;
    return parsePayloadFields(payload);
  } catch (error: any) {
    return {
      name: null,
      description: null,
      protocols: [],
      x402Supported: null,
      serviceEndpointsJson: {},
      crossChainJson: [],
      parseStatus: "error",
      fieldSources: {
        source: "agent_uri",
        reason: compactReason(error),
      },
    };
  }
}
