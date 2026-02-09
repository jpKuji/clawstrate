import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { topics, actionTopics, actions, agents, enrichments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const topic = await db.query.topics.findFirst({
    where: eq(topics.slug, slug),
  });

  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get recent actions for this topic
  const topicActions = await db
    .select({
      action: actions,
      agentName: agents.displayName,
      autonomyScore: enrichments.autonomyScore,
      sentiment: enrichments.sentiment,
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .leftJoin(agents, eq(actions.agentId, agents.id))
    .leftJoin(enrichments, eq(enrichments.actionId, actions.id))
    .where(eq(actionTopics.topicId, topic.id))
    .orderBy(desc(actions.performedAt))
    .limit(30);

  return NextResponse.json({
    topic,
    recentActions: topicActions,
  });
}
