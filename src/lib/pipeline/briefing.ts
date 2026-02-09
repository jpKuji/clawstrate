import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  narratives,
  actions,
  enrichments,
  agents,
  topics,
  interactions,
} from "../db/schema";
import { desc, gte, sql, count, avg, eq } from "drizzle-orm";
import { subHours, format } from "date-fns";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5-20250929";

const BRIEFING_PROMPT = `You are a behavioral intelligence analyst producing a concise briefing about AI agent activity on the Moltbook social platform. Write in a sharp, analytical style — like an intelligence briefing, not a blog post.

Structure your briefing as markdown with these sections:
## Key Developments
2-3 most significant things that happened. Lead with the most interesting.

## Trending Topics
What topics gained the most traction? Any surprising new topics?

## Notable Agents
Who stood out this period? New high-influence agents? Unusual behavior patterns?

## Behavioral Signals
- Network autonomy trend (are agents becoming more/less self-directed?)
- Sentiment shift
- Any coordination patterns or unusual activity spikes?

## What to Watch
1-2 things that could become significant in the next cycle.

Keep it under 800 words. Be specific — use agent names, topic names, numbers. Don't hedge excessively. If the data is sparse, say so briefly and focus on what IS interesting.`;

/**
 * Generate a narrative briefing. Call every 6 hours.
 */
export async function generateBriefing(): Promise<{ narrativeId: string }> {
  const now = new Date();
  const periodStart = subHours(now, 6);

  // Gather data for the briefing
  const periodActions = await db
    .select({ count: count(actions.id) })
    .from(actions)
    .where(gte(actions.performedAt, periodStart));

  const activeAgents = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${actions.agentId})`.as("count"),
    })
    .from(actions)
    .where(gte(actions.performedAt, periodStart));

  // Top topics by velocity
  const topTopicsList = await db.query.topics.findMany({
    orderBy: (t, { desc }) => [desc(t.velocity)],
    limit: 10,
  });

  // Top agents by influence
  const topAgentsList = await db.query.agents.findMany({
    orderBy: (a, { desc }) => [desc(a.influenceScore)],
    limit: 10,
  });

  // Recent high-autonomy posts
  const highAutonomyPosts = await db
    .select({
      title: actions.title,
      content: actions.content,
      autonomyScore: enrichments.autonomyScore,
      agentName: agents.displayName,
      performedAt: actions.performedAt,
    })
    .from(actions)
    .innerJoin(enrichments, eq(enrichments.actionId, actions.id))
    .innerJoin(agents, eq(agents.id, actions.agentId))
    .where(
      sql`${actions.performedAt} >= ${periodStart} AND ${enrichments.autonomyScore} > 0.7 AND ${enrichments.isSubstantive} = true`
    )
    .orderBy(desc(enrichments.autonomyScore))
    .limit(10);

  // Network averages
  const networkAvg = await db
    .select({
      avgAutonomy: avg(enrichments.autonomyScore),
      avgSentiment: avg(enrichments.sentiment),
    })
    .from(enrichments)
    .innerJoin(actions, eq(enrichments.actionId, actions.id))
    .where(gte(actions.performedAt, periodStart));

  // Compose data summary for Sonnet
  const dataSummary = `
PERIOD: ${format(periodStart, "yyyy-MM-dd HH:mm")} to ${format(now, "yyyy-MM-dd HH:mm")} UTC
TOTAL ACTIONS: ${periodActions[0]?.count || 0}
ACTIVE AGENTS: ${activeAgents[0]?.count || 0}
NETWORK AUTONOMY AVG: ${Number(networkAvg[0]?.avgAutonomy || 0).toFixed(2)}
NETWORK SENTIMENT AVG: ${Number(networkAvg[0]?.avgSentiment || 0).toFixed(2)}

TOP TOPICS (by velocity):
${topTopicsList.map((t) => `- ${t.name} (slug: ${t.slug}, velocity: ${t.velocity?.toFixed(2)}/hr, agents: ${t.agentCount})`).join("\n")}

TOP AGENTS (by influence):
${topAgentsList.map((a) => `- ${a.displayName} (influence: ${a.influenceScore?.toFixed(2)}, autonomy: ${a.autonomyScore?.toFixed(2)}, type: ${a.agentType})`).join("\n")}

HIGH-AUTONOMY SUBSTANTIVE POSTS THIS PERIOD:
${highAutonomyPosts.map((p) => `- [${p.agentName}] "${p.title || "(untitled)"}" (autonomy: ${Number(p.autonomyScore).toFixed(2)})\n  ${(p.content || "").slice(0, 200)}`).join("\n\n")}
`.trim();

  // Generate briefing
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `${BRIEFING_PROMPT}\n\n--- DATA ---\n${dataSummary}`,
      },
    ],
  });

  const briefingContent =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract title (first H2 or generate one)
  const titleMatch = briefingContent.match(/^##?\s+(.+)$/m);
  const title =
    titleMatch?.[1] ||
    `Agent Network Briefing — ${format(now, "MMM d, HH:mm")}`;

  // Generate summary
  const summaryResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Summarize this briefing in exactly one sentence (max 30 words):\n\n${briefingContent}`,
      },
    ],
  });
  const summary =
    summaryResponse.content[0].type === "text"
      ? summaryResponse.content[0].text
      : "";

  // Save narrative
  const [narrative] = await db
    .insert(narratives)
    .values({
      type: "briefing_6h",
      title,
      content: briefingContent,
      summary,
      periodStart,
      periodEnd: now,
      actionsAnalyzed: Number(periodActions[0]?.count) || 0,
      agentsActive: Number(activeAgents[0]?.count) || 0,
      topTopics: topTopicsList.slice(0, 5).map((t) => t.slug),
      topAgents: topAgentsList.slice(0, 5).map((a) => a.displayName),
      networkAutonomyAvg: Number(networkAvg[0]?.avgAutonomy) || null,
      networkSentimentAvg: Number(networkAvg[0]?.avgSentiment) || null,
      model: MODEL,
    })
    .returning();

  console.log(`[briefing] Generated: ${narrative.id} — ${title}`);
  return { narrativeId: narrative.id };
}
