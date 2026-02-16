import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOnchainExport } from "@/lib/onchain/exports";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";

const exportSchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  filters: z
    .object({
      chainId: z.number().int().positive().optional(),
      standard: z.string().trim().min(1).optional(),
      fromBlock: z.number().int().positive().optional(),
      toBlock: z.number().int().positive().optional(),
    })
    .optional()
    .default({}),
});

export async function POST(req: NextRequest) {
  try {
    const accountId = getAccountIdFromRequest(req.headers);
    const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_export" });
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.message,
          quota: gate.quota,
        },
        { status: gate.status }
      );
    }

    const body = await req.json();
    const parsed = exportSchema.parse(body);

    const result = await createOnchainExport({
      accountId,
      format: parsed.format,
      filters: parsed.filters,
    });

    return NextResponse.json({
      id: result.id,
      status: result.status,
      format: parsed.format,
      rowCount: result.rowCount,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: error?.message ?? "Failed to create export" }, { status: 500 });
  }
}
