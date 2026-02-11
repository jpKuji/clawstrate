import { and, count, eq, gte, sql } from "drizzle-orm";
import { startOfDay, startOfMonth } from "date-fns";
import { db } from "./db";
import { accounts, accountUsageDaily, productEvents } from "./db/schema";

export type ProductEventType =
  | "briefing_view"
  | "alert_interaction"
  | "watchlist_add"
  | "watchlist_remove";

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
    briefingViewQuota: number | null;
    alertInteractionQuota: number | null;
    briefingViewsExceeded: boolean;
    alertInteractionsExceeded: boolean;
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

  await db
    .insert(accountUsageDaily)
    .values({
      accountId,
      date: day,
      briefingViews: shouldIncrementBriefingViews,
      alertInteractions: shouldIncrementAlerts,
      watchlistInteractions: shouldIncrementWatchlist,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [accountUsageDaily.accountId, accountUsageDaily.date],
      set: {
        briefingViews: sql`${accountUsageDaily.briefingViews} + ${shouldIncrementBriefingViews}`,
        alertInteractions: sql`${accountUsageDaily.alertInteractions} + ${shouldIncrementAlerts}`,
        watchlistInteractions: sql`${accountUsageDaily.watchlistInteractions} + ${shouldIncrementWatchlist}`,
        updatedAt: new Date(),
      },
    });

  const quota = await getAccountQuotaStatus(accountId);
  return { eventId: event.id, quota };
}

export async function getAccountQuotaStatus(accountId: string): Promise<{
  monthlyBriefingViews: number;
  monthlyAlertInteractions: number;
  briefingViewQuota: number | null;
  alertInteractionQuota: number | null;
  briefingViewsExceeded: boolean;
  alertInteractionsExceeded: boolean;
}> {
  await ensureAccount(accountId);
  const monthStart = startOfMonth(new Date());

  const [account, briefingViews, alertInteractions] = await Promise.all([
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
  ]);

  const monthlyBriefingViews = Number(briefingViews[0]?.count || 0);
  const monthlyAlertInteractions = Number(alertInteractions[0]?.count || 0);

  const briefingViewQuota = account?.monthlyBriefingViewQuota ?? null;
  const alertInteractionQuota = account?.monthlyAlertInteractionQuota ?? null;

  return {
    monthlyBriefingViews,
    monthlyAlertInteractions,
    briefingViewQuota,
    alertInteractionQuota,
    briefingViewsExceeded:
      briefingViewQuota != null && monthlyBriefingViews > briefingViewQuota,
    alertInteractionsExceeded:
      alertInteractionQuota != null && monthlyAlertInteractions > alertInteractionQuota,
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
