import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { narratives } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  const id = searchParams.get("id");

  if (id) {
    const narrative = await db.query.narratives.findFirst({
      where: eq(narratives.id, id),
    });
    return narrative
      ? NextResponse.json(narrative)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results = await db.query.narratives.findMany({
    orderBy: (n, { desc }) => [desc(n.generatedAt)],
    limit,
  });

  return NextResponse.json(results);
}
