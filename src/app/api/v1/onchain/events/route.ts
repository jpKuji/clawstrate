import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { extractRows, parsePositiveInt } from "@/lib/onchain/api-utils";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";

export async function GET(req: NextRequest) {
  const accountId = getAccountIdFromRequest(req.headers);
  const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_api_call" });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, quota: gate.quota }, { status: gate.status });
  }

  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get("chainId");
  const standard = searchParams.get("standard")?.trim();
  const eventName = searchParams.get("eventName")?.trim();
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 100), 500);
  const offset = Math.max(parsePositiveInt(searchParams.get("offset"), 0), 0);

  const filters = [sql`TRUE`];
  if (chainId) filters.push(sql`chain_id = ${Number(chainId)}`);
  if (standard) filters.push(sql`standard = ${standard}`);
  if (eventName) filters.push(sql`event_name = ${eventName}`);

  const whereSql = sql.join(filters, sql` AND `);

  const rowsResult = await db.execute(sql`
    SELECT
      chain_id,
      standard,
      contract_address,
      block_number,
      block_time,
      tx_hash,
      log_index,
      event_name,
      event_sig,
      decoded_json
    FROM onchain_event_logs
    WHERE ${whereSql}
    ORDER BY block_number DESC, log_index DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM onchain_event_logs
    WHERE ${whereSql}
  `);

  const rows = extractRows<Record<string, unknown>>(rowsResult);
  const total = Number(extractRows<{ count: number }>(totalResult)[0]?.count ?? 0);

  return NextResponse.json({
    total,
    limit,
    offset,
    items: rows.map((row) => ({
      chainId: Number(row.chain_id),
      standard: row.standard,
      contractAddress: row.contract_address,
      blockNumber: Number(row.block_number),
      blockTime: row.block_time,
      txHash: row.tx_hash,
      logIndex: Number(row.log_index),
      eventName: row.event_name,
      eventSig: row.event_sig,
      decoded: row.decoded_json,
    })),
  });
}
