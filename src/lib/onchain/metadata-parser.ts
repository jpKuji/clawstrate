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

export async function parseAgentMetadataFromUri(uri: string): Promise<ParsedMetadataResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(uri, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

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
        reason: error?.message ?? "unknown_error",
      },
    };
  }
}
