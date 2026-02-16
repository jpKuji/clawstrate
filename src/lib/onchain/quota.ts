import { getAccountQuotaStatus, recordProductEvent } from "@/lib/telemetry";

export function getAccountIdFromRequest(headers: Headers): string {
  return headers.get("x-account-id") || "default";
}

export async function enforceOnchainQuota(input: {
  accountId: string;
  eventType: "onchain_api_call" | "onchain_export";
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      message: string;
      quota: Awaited<ReturnType<typeof getAccountQuotaStatus>>;
    }
> {
  const quota = await getAccountQuotaStatus(input.accountId);

  if (
    input.eventType === "onchain_api_call" &&
    quota.onchainApiCallQuota != null &&
    quota.monthlyOnchainApiCalls >= quota.onchainApiCallQuota
  ) {
    return {
      ok: false,
      status: 429,
      message: "Onchain API quota exceeded for this account",
      quota,
    };
  }

  if (
    input.eventType === "onchain_export" &&
    quota.onchainExportQuota != null &&
    quota.monthlyOnchainExports >= quota.onchainExportQuota
  ) {
    return {
      ok: false,
      status: 429,
      message: "Onchain export quota exceeded for this account",
      quota,
    };
  }

  await recordProductEvent({
    accountId: input.accountId,
    eventType: input.eventType,
    metadata: { surface: "onchain" },
  });

  return { ok: true };
}
