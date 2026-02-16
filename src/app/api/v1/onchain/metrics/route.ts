import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { extractRows } from "@/lib/onchain/api-utils";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";

export async function GET(req: NextRequest) {
  const accountId = getAccountIdFromRequest(req.headers);
  const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_api_call" });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, quota: gate.quota }, { status: gate.status });
  }

  const [totalsResult, recentResult] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM onchain_event_logs) AS total_events,
        (SELECT COUNT(*)::int FROM erc8004_agents) AS total_agents,
        (SELECT COUNT(*)::int FROM erc8004_feedbacks) AS total_feedbacks,
        (SELECT COUNT(*)::int FROM erc8004_validations) AS total_validations,
        (SELECT COUNT(*)::int FROM erc4337_userops) AS total_userops,
        (SELECT COUNT(*)::int FROM erc8001_coordinations) AS total_coordinations
    `),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM onchain_event_logs WHERE block_time >= NOW() - INTERVAL '24 hours') AS events_24h,
        (SELECT COUNT(*)::int FROM erc8004_agents WHERE updated_at >= NOW() - INTERVAL '24 hours') AS agents_24h,
        (SELECT COUNT(*)::int FROM erc4337_userops WHERE updated_at >= NOW() - INTERVAL '24 hours') AS userops_24h
    `),
  ]);

  const totals = extractRows<Record<string, unknown>>(totalsResult)[0] ?? {};
  const recent = extractRows<Record<string, unknown>>(recentResult)[0] ?? {};

  return NextResponse.json({
    totals: {
      events: Number(totals.total_events ?? 0),
      agents: Number(totals.total_agents ?? 0),
      feedbacks: Number(totals.total_feedbacks ?? 0),
      validations: Number(totals.total_validations ?? 0),
      userOps: Number(totals.total_userops ?? 0),
      coordinations: Number(totals.total_coordinations ?? 0),
    },
    last24h: {
      events: Number(recent.events_24h ?? 0),
      agents: Number(recent.agents_24h ?? 0),
      userOps: Number(recent.userops_24h ?? 0),
    },
  });
}
