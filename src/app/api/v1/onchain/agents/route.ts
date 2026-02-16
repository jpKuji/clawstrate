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
  const search = searchParams.get("search")?.trim() || "";
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 50), 200);
  const offset = Math.max(parsePositiveInt(searchParams.get("offset"), 0), 0);

  const filters = [sql`TRUE`];
  if (chainId) {
    filters.push(sql`a.chain_id = ${Number(chainId)}`);
  }
  if (search.length > 0) {
    const pattern = `%${search}%`;
    filters.push(sql`(
      a.agent_key ILIKE ${pattern}
      OR COALESCE(m.name, '') ILIKE ${pattern}
      OR COALESCE(m.description, '') ILIKE ${pattern}
    )`);
  }

  const whereSql = sql.join(filters, sql` AND `);

  const rowsResult = await db.execute(sql`
    SELECT
      a.agent_key,
      a.chain_id,
      a.registry_address,
      a.agent_id,
      a.owner_address,
      a.agent_uri,
      a.agent_wallet,
      a.is_active,
      a.last_event_block,
      a.created_at,
      a.updated_at,
      m.name,
      m.description,
      m.protocols,
      m.x402_supported,
      m.parse_status,
      m.service_endpoints_json,
      m.cross_chain_json
    FROM erc8004_agents a
    LEFT JOIN erc8004_agent_metadata m ON m.agent_key = a.agent_key
    WHERE ${whereSql}
    ORDER BY a.updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM erc8004_agents a
    LEFT JOIN erc8004_agent_metadata m ON m.agent_key = a.agent_key
    WHERE ${whereSql}
  `);

  const rows = extractRows<Record<string, unknown>>(rowsResult);
  const total = Number(extractRows<{ count: number }>(totalResult)[0]?.count ?? 0);

  return NextResponse.json({
    total,
    limit,
    offset,
    items: rows.map((row) => ({
      agentKey: row.agent_key,
      chainId: Number(row.chain_id),
      registryAddress: row.registry_address,
      agentId: row.agent_id,
      ownerAddress: row.owner_address,
      agentUri: row.agent_uri,
      agentWallet: row.agent_wallet,
      isActive: row.is_active,
      lastEventBlock: Number(row.last_event_block ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      name: row.name,
      description: row.description,
      protocols: Array.isArray(row.protocols) ? row.protocols : [],
      x402Supported: row.x402_supported,
      parseStatus: row.parse_status,
      serviceEndpoints: row.service_endpoints_json,
      crossChain: row.cross_chain_json,
    })),
  });
}
