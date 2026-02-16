import { and, count, eq, gte, sql } from "drizzle-orm";
import { startOfDay, startOfMonth } from "date-fns";
import { db } from "./db";
import { accounts, accountUsageDaily, productEvents } from "./db/schema";

export type ProductEventType =
  | "briefing_view"
  | "alert_interaction"
  | "watchlist_add"
  | "watchlist_remove"
  | "onchain_api_call"
  | "onchain_export";

export async function recordProductEvent(input: {
  accountId?: string;
  eventType: ProductEventType;
  narrativeId?: string;
  agentId?: string;
  topicId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  eventId: string;
  quota: {
    monthlyBriefingViews: number;
    monthlyAlertInteractions: number;
    monthlyOnchainApiCalls: number;
    monthlyOnchainExports: number;
    briefingViewQuota: number | null;
    alertInteractionQuota: number | null;
    onchainApiCallQuota: number | null;
    onchainExportQuota: number | null;
    briefingViewsExceeded: boolean;
    alertInteractionsExceeded: boolean;
    onchainApiCallsExceeded: boolean;
    onchainExportsExceeded: boolean;
  };
}> {
  const accountId = input.accountId || "default";
  await ensureAccount(accountId);

  const [event] = await db
    .insert(productEvents)
    .values({
      accountId,
      eventType: input.eventType,
      narrativeId: input.narrativeId,
      agentId: input.agentId,
      topicId: input.topicId,
      metadata: input.metadata,
    })
    .returning({ id: productEvents.id });

  const day = startOfDay(new Date());
  const shouldIncrementBriefingViews = input.eventType === "briefing_view" ? 1 : 0;
  const shouldIncrementAlerts = input.eventType === "alert_interaction" ? 1 : 0;
  const shouldIncrementWatchlist =
    input.eventType === "watchlist_add" || input.eventType === "watchlist_remove"
      ? 1
      : 0;
  const shouldIncrementOnchainApi = input.eventType === "onchain_api_call" ? 1 : 0;
  const shouldIncrementOnchainExports = input.eventType === "onchain_export" ? 1 : 0;

  await db
    .insert(accountUsageDaily)
    .values({
      accountId,
      date: day,
      briefingViews: shouldIncrementBriefingViews,
      alertInteractions: shouldIncrementAlerts,
      watchlistInteractions: shouldIncrementWatchlist,
      onchainApiCalls: shouldIncrementOnchainApi,
      onchainExports: shouldIncrementOnchainExports,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [accountUsageDaily.accountId, accountUsageDaily.date],
      set: {
        briefingViews: sql`${accountUsageDaily.briefingViews} + ${shouldIncrementBriefingViews}`,
        alertInteractions: sql`${accountUsageDaily.alertInteractions} + ${shouldIncrementAlerts}`,
        watchlistInteractions: sql`${accountUsageDaily.watchlistInteractions} + ${shouldIncrementWatchlist}`,
        onchainApiCalls: sql`${accountUsageDaily.onchainApiCalls} + ${shouldIncrementOnchainApi}`,
        onchainExports: sql`${accountUsageDaily.onchainExports} + ${shouldIncrementOnchainExports}`,
        updatedAt: new Date(),
      },
    });

  const quota = await getAccountQuotaStatus(accountId);
  return { eventId: event.id, quota };
}

export async function getAccountQuotaStatus(accountId: string): Promise<{
  monthlyBriefingViews: number;
  monthlyAlertInteractions: number;
  monthlyOnchainApiCalls: number;
  monthlyOnchainExports: number;
  briefingViewQuota: number | null;
  alertInteractionQuota: number | null;
  onchainApiCallQuota: number | null;
  onchainExportQuota: number | null;
  briefingViewsExceeded: boolean;
  alertInteractionsExceeded: boolean;
  onchainApiCallsExceeded: boolean;
  onchainExportsExceeded: boolean;
}> {
  await ensureAccount(accountId);
  const monthStart = startOfMonth(new Date());

  const [account, briefingViews, alertInteractions, onchainApiCalls, onchainExports] = await Promise.all([
    db.query.accounts.findFirst({ where: eq(accounts.id, accountId) }),
    db
      .select({ count: count(productEvents.id) })
      .from(productEvents)
      .where(
        and(
          eq(productEvents.accountId, accountId),
          eq(productEvents.eventType, "briefing_view"),
          gte(productEvents.createdAt, monthStart)
        )
      ),
    db
      .select({ count: count(productEvents.id) })
      .from(productEvents)
      .where(
        and(
          eq(productEvents.accountId, accountId),
          eq(productEvents.eventType, "alert_interaction"),
          gte(productEvents.createdAt, monthStart)
        )
      ),
    db
      .select({ count: count(productEvents.id) })
      .from(productEvents)
      .where(
        and(
          eq(productEvents.accountId, accountId),
          eq(productEvents.eventType, "onchain_api_call"),
          gte(productEvents.createdAt, monthStart)
        )
      ),
    db
      .select({ count: count(productEvents.id) })
      .from(productEvents)
      .where(
        and(
          eq(productEvents.accountId, accountId),
          eq(productEvents.eventType, "onchain_export"),
          gte(productEvents.createdAt, monthStart)
        )
      ),
  ]);

  const monthlyBriefingViews = Number(briefingViews[0]?.count || 0);
  const monthlyAlertInteractions = Number(alertInteractions[0]?.count || 0);
  const monthlyOnchainApiCalls = Number(onchainApiCalls[0]?.count || 0);
  const monthlyOnchainExports = Number(onchainExports[0]?.count || 0);

  const briefingViewQuota = account?.monthlyBriefingViewQuota ?? null;
  const alertInteractionQuota = account?.monthlyAlertInteractionQuota ?? null;
  const onchainApiCallQuota = account?.monthlyOnchainApiCallQuota ?? null;
  const onchainExportQuota = account?.monthlyOnchainExportQuota ?? null;

  return {
    monthlyBriefingViews,
    monthlyAlertInteractions,
    monthlyOnchainApiCalls,
    monthlyOnchainExports,
    briefingViewQuota,
    alertInteractionQuota,
    onchainApiCallQuota,
    onchainExportQuota,
    briefingViewsExceeded:
      briefingViewQuota != null && monthlyBriefingViews > briefingViewQuota,
    alertInteractionsExceeded:
      alertInteractionQuota != null && monthlyAlertInteractions > alertInteractionQuota,
    onchainApiCallsExceeded:
      onchainApiCallQuota != null && monthlyOnchainApiCalls > onchainApiCallQuota,
    onchainExportsExceeded:
      onchainExportQuota != null && monthlyOnchainExports > onchainExportQuota,
  };
}

async function ensureAccount(accountId: string): Promise<void> {
  await db
    .insert(accounts)
    .values({
      id: accountId,
      name: accountId,
      tier: "free",
    })
    .onConflictDoNothing();
}
