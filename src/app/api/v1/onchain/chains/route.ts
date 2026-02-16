import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";
import { extractRows } from "@/lib/onchain/api-utils";

export async function GET(req: NextRequest) {
  const accountId = getAccountIdFromRequest(req.headers);
  const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_api_call" });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, quota: gate.quota }, { status: gate.status });
  }

  const rowsResult = await db.execute(sql`
    SELECT
      c.chain_id,
      c.name,
      c.enabled,
      c.is_testnet,
      COUNT(DISTINCT oc.id)::int AS contract_count,
      COALESCE(MAX(oel.block_number), 0)::int AS latest_block
    FROM onchain_chains c
    LEFT JOIN onchain_contracts oc ON oc.chain_id = c.chain_id
    LEFT JOIN onchain_event_logs oel ON oel.chain_id = c.chain_id
    GROUP BY c.chain_id, c.name, c.enabled, c.is_testnet
    ORDER BY c.chain_id ASC
  `);

  const rows = extractRows<{
    chain_id: number;
    name: string;
    enabled: boolean;
    is_testnet: boolean;
    contract_count: number;
    latest_block: number;
  }>(rowsResult);

  return NextResponse.json({
    items: rows.map((row) => ({
      chainId: Number(row.chain_id),
      name: row.name,
      enabled: row.enabled,
      isTestnet: row.is_testnet,
      contractCount: Number(row.contract_count || 0),
      latestBlock: Number(row.latest_block || 0),
    })),
  });
}
