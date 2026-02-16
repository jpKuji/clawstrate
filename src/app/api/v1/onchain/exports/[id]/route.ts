import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { onchainExports } from "@/lib/db/schema";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const accountId = getAccountIdFromRequest(req.headers);
  const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_api_call" });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, quota: gate.quota }, { status: gate.status });
  }

  const { id } = await context.params;
  const rows = await db
    .select({
      id: onchainExports.id,
      format: onchainExports.format,
      status: onchainExports.status,
      filters: onchainExports.filters,
      fileContent: onchainExports.fileContent,
      createdAt: onchainExports.createdAt,
      accountId: onchainExports.accountId,
    })
    .from(onchainExports)
    .where(eq(onchainExports.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Export not found" }, { status: 404 });
  }

  if (row.accountId && row.accountId !== accountId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: row.id,
    format: row.format,
    status: row.status,
    filters: row.filters,
    content: row.fileContent,
    createdAt: row.createdAt,
  });
}
