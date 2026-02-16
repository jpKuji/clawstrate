import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { onchainExports } from "@/lib/db/schema";
import { extractRows } from "./api-utils";

export interface OnchainExportFilters {
  chainId?: number;
  standard?: string;
  fromBlock?: number;
  toBlock?: number;
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return lines.join("\n");
}

export async function createOnchainExport(input: {
  accountId: string;
  format: "csv" | "json";
  filters: OnchainExportFilters;
}): Promise<{ id: string; status: string; rowCount: number; content: string }> {
  const filters = [sql`TRUE`];
  if (input.filters.chainId) {
    filters.push(sql`chain_id = ${input.filters.chainId}`);
  }
  if (input.filters.standard) {
    filters.push(sql`standard = ${input.filters.standard}`);
  }
  if (input.filters.fromBlock) {
    filters.push(sql`block_number >= ${input.filters.fromBlock}`);
  }
  if (input.filters.toBlock) {
    filters.push(sql`block_number <= ${input.filters.toBlock}`);
  }
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
      decoded_json
    FROM onchain_event_logs
    WHERE ${whereSql}
    ORDER BY block_number DESC, log_index DESC
    LIMIT 10000
  `);

  const rows = extractRows<Record<string, unknown>>(rowsResult);
  const content = input.format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);

  const [created] = await db
    .insert(onchainExports)
    .values({
      accountId: input.accountId,
      format: input.format,
      status: "completed",
      filters: input.filters as Record<string, unknown>,
      fileContent: content,
      createdAt: new Date(),
    })
    .returning({
      id: onchainExports.id,
      status: onchainExports.status,
    });

  return {
    id: created.id,
    status: created.status,
    rowCount: rows.length,
    content,
  };
}
