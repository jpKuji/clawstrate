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

  const [configuredByChainResult, seenByChainResult, enabledChainsResult] = await Promise.all([
    db.execute(sql`
      SELECT chain_id, COUNT(DISTINCT address)::int AS count
      FROM onchain_contracts
      WHERE standard = 'erc4337'
        AND role = 'entrypoint'
        AND enabled = true
      GROUP BY chain_id
      ORDER BY chain_id
    `),
    db.execute(sql`
      SELECT chain_id, COUNT(DISTINCT entry_point)::int AS count
      FROM erc4337_userops
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
        AND entry_point IS NOT NULL
      GROUP BY chain_id
      ORDER BY chain_id
    `),
    db.execute(sql`
      SELECT chain_id
      FROM onchain_chains
      WHERE enabled = true
      ORDER BY chain_id
    `),
  ]);

  const totals = extractRows<Record<string, unknown>>(totalsResult)[0] ?? {};
  const recent = extractRows<Record<string, unknown>>(recentResult)[0] ?? {};
  const configuredByChainRows = extractRows<Record<string, unknown>>(configuredByChainResult);
  const seenByChainRows = extractRows<Record<string, unknown>>(seenByChainResult);
  const enabledChainsRows = extractRows<Record<string, unknown>>(enabledChainsResult);

  const configuredByChain = Object.fromEntries(
    configuredByChainRows.map((row) => [String(Number(row.chain_id)), Number(row.count ?? 0)])
  );
  const seenByChain24h = Object.fromEntries(
    seenByChainRows.map((row) => [String(Number(row.chain_id)), Number(row.count ?? 0)])
  );
  const configuredEntryPoints = Object.values(configuredByChain).reduce(
    (sum, value) => sum + Number(value),
    0
  );
  const seenEntryPoints24h = Object.values(seenByChain24h).reduce(
    (sum, value) => sum + Number(value),
    0
  );
  const enabledChainIds = enabledChainsRows.map((row) => Number(row.chain_id));
  const isDualEntryPointConfigured =
    enabledChainIds.length > 0 &&
    enabledChainIds.every((chainId) => Number(configuredByChain[String(chainId)] ?? 0) >= 2);

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
    erc4337Coverage: {
      configuredEntryPoints,
      seenEntryPoints24h,
      configuredByChain,
      seenByChain24h,
      isDualEntryPointConfigured,
    },
  });
}
