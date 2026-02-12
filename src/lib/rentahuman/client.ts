import type {
  RentAHumanListBountiesResponse,
  RentAHumanGetBountyResponse,
  RentAHumanGetHumanResponse,
} from "./types";

const API_BASE = "https://rentahuman.ai/api";

type RentAHumanApiError = Error & { status?: number; code?: string };

function makeApiError(message: string, extras?: { status?: number; code?: string }): RentAHumanApiError {
  const err = new Error(message) as RentAHumanApiError;
  if (extras?.status) err.status = extras.status;
  if (extras?.code) err.code = extras.code;
  return err;
}

class RentAHumanClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const rateLimit = res.headers.get("x-ratelimit-limit");
    const rateRemaining = res.headers.get("x-ratelimit-remaining");
    const rateHint =
      rateLimit || rateRemaining
        ? ` (rate ${rateRemaining ?? "?"}/${rateLimit ?? "?"})`
        : "";

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!res.ok) {
      const body = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
      const bodyText = typeof body === "string" ? body : JSON.stringify(body);
      throw makeApiError(`RentAHuman API ${res.status}${rateHint}: ${bodyText}`, { status: res.status });
    }

    const data: any = isJson ? await res.json() : await res.text();
    if (data && typeof data === "object" && "success" in data && data.success === false) {
      throw makeApiError(
        `RentAHuman API error${rateHint}: ${data.error || "unknown error"}`,
        { code: data.error_code }
      );
    }

    return data as T;
  }

  async listBounties(params?: {
    limit?: number;
    cursor?: string;
    status?: string;
  }): Promise<RentAHumanListBountiesResponse> {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<RentAHumanListBountiesResponse>(`/bounties${suffix}`);
  }

  async getBounty(id: string): Promise<RentAHumanGetBountyResponse> {
    return this.request<RentAHumanGetBountyResponse>(`/bounties/${encodeURIComponent(id)}`);
  }

  async getHuman(id: string): Promise<RentAHumanGetHumanResponse> {
    return this.request<RentAHumanGetHumanResponse>(`/humans/${encodeURIComponent(id)}`);
  }
}

let client: RentAHumanClient | null = null;

export function getRentAHumanClient(): RentAHumanClient {
  if (!client) {
    client = new RentAHumanClient();
  }
  return client;
}

export type { RentAHumanClient };
