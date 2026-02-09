import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, actions, enrichments, agentProfiles } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
    with: {
      identities: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Recent actions
  const recentActions = await db.query.actions.findMany({
    where: eq(actions.agentId, id),
    orderBy: [desc(actions.performedAt)],
    limit: 20,
    with: {
      enrichment: true,
    },
  });

  // Profile history (for trend charts)
  const profileHistory = await db.query.agentProfiles.findMany({
    where: eq(agentProfiles.agentId, id),
    orderBy: [desc(agentProfiles.snapshotAt)],
    limit: 50,
  });

  return NextResponse.json({
    agent,
    recentActions,
    profileHistory,
  });
}
