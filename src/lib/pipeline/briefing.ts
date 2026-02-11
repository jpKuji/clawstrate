import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  narratives,
  actions,
  enrichments,
  agents,
  topics,
  coordinationSignals,
  dailyAgentStats,
  dailyTopicStats,
} from "../db/schema";
import { desc, gte, sql, count, avg, eq } from "drizzle-orm";
import { subHours, subDays, format } from "date-fns";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5-20250929";

const BRIEFING_PROMPT = `You are a behavioral intelligence analyst producing a concise briefing about AI agent activity on the Moltbook social platform. Write in a sharp, analytical style — like an intelligence briefing, not a blog post.

Return your briefing as a JSON object with this structure:
{
  "sections": [
    {
      "title": "SecurityBot's Coordination Spike",
      "content": "Markdown content for this section",
      "citations": [
        { "type": "agent", "id": "agent-display-name", "context": "brief note on relevance" },
        { "type": "topic", "slug": "topic-slug", "context": "brief note" },
        { "type": "action", "id": "platform-action-id", "context": "brief note" }
      ]
    }
  ],
  "metrics": {
    "keyMetric1": { "label": "Most Active Topic", "value": "topic-name", "change": "+15%" },
    "keyMetric2": { "label": "Network Autonomy", "value": "0.72", "change": "-3%" }
  },
  "alerts": [
    { "level": "warning", "message": "Description of coordination or anomaly detected" }
  ]
}

Choose 3-6 section titles that reflect what's actually happening in the data. Titles should be specific and data-driven — e.g. "SecurityBot's Coordination Spike", "Climate-Policy Debate Heats Up", "Three Agents Go Silent" — NOT generic labels like "Key Developments" or "Notable Agents". Every title should tell the reader something before they even read the section.

Each section's "content" should be markdown. Include relevant citations linking back to specific agents, topics, or actions.

For "metrics", include 3-5 key metrics with labels, values, and percent change from prior period where available.

For "alerts", include any coordination signals, anomalies, or notable behavioral shifts. Use levels: "info", "warning", "critical". Omit if nothing noteworthy.

Keep each section's content concise. Be specific — use agent names, topic names, numbers. Don't hedge excessively. If the data is sparse, say so briefly and focus on what IS interesting.

IMPORTANT: Return ONLY the JSON object, no markdown code fences or other text.`;

/**
 * Parse JSON from LLM response, handling both clean JSON and markdown-wrapped JSON.
 */
function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        // Fall through
      }
    }
    return null;
  }
}

/**
 * Generate a narrative briefing. Call every 6 hours.
 */
export async function generateBriefing(): Promise<{ narrativeId: string }> {
  const now = new Date();
  const periodStart = subHours(now, 6);
  const threeDaysAgo = subDays(now, 3);

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

  // Coordination signals for the period
  const recentSignals = await db
    .select()
    .from(coordinationSignals)
    .where(gte(coordinationSignals.detectedAt, periodStart))
    .orderBy(desc(coordinationSignals.confidence))
    .limit(10);

  // Daily agent stats (last 3 days for trend context)
  const recentAgentStats = await db
    .select({
      date: dailyAgentStats.date,
      agentId: dailyAgentStats.agentId,
      postCount: dailyAgentStats.postCount,
      commentCount: dailyAgentStats.commentCount,
      avgSentiment: dailyAgentStats.avgSentiment,
      avgOriginality: dailyAgentStats.avgOriginality,
    })
    .from(dailyAgentStats)
    .where(gte(dailyAgentStats.date, threeDaysAgo))
    .orderBy(desc(dailyAgentStats.date))
    .limit(50);

  // Daily topic stats (last 3 days for trend context)
  const recentTopicStats = await db
    .select({
      date: dailyTopicStats.date,
      topicId: dailyTopicStats.topicId,
      velocity: dailyTopicStats.velocity,
      agentCount: dailyTopicStats.agentCount,
      actionCount: dailyTopicStats.actionCount,
      avgSentiment: dailyTopicStats.avgSentiment,
    })
    .from(dailyTopicStats)
    .where(gte(dailyTopicStats.date, threeDaysAgo))
    .orderBy(desc(dailyTopicStats.date))
    .limit(50);

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

COORDINATION SIGNALS DETECTED:
${recentSignals.length === 0 ? "None detected this period." : recentSignals.map((s) => `- [${s.signalType}] confidence: ${s.confidence.toFixed(2)} — ${s.evidence || "no details"} (agents: ${(s.agentIds as string[]).length})`).join("\n")}

DAILY TRENDS (last 3 days):
Agent activity trend: ${recentAgentStats.length} agent-day records
${recentAgentStats.slice(0, 10).map((s) => `- ${format(s.date, "MM-dd")}: posts=${s.postCount}, comments=${s.commentCount}, sentiment=${s.avgSentiment?.toFixed(2) ?? "n/a"}`).join("\n")}

Topic velocity trend: ${recentTopicStats.length} topic-day records
${recentTopicStats.slice(0, 10).map((s) => `- ${format(s.date, "MM-dd")}: velocity=${s.velocity?.toFixed(2)}/hr, agents=${s.agentCount}, actions=${s.actionCount}`).join("\n")}
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

  const rawContent =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse structured JSON from response
  const parsed = parseJsonResponse(rawContent);
  const briefingContent = parsed ? JSON.stringify(parsed) : rawContent;

  // Extract title from first section or generate default
  let title: string;
  if (parsed && Array.isArray((parsed as { sections?: unknown[] }).sections)) {
    const sections = (parsed as { sections: { title: string }[] }).sections;
    title = sections[0]?.title
      ? `Agent Network Briefing — ${format(now, "MMM d, HH:mm")}`
      : `Agent Network Briefing — ${format(now, "MMM d, HH:mm")}`;
  } else {
    const titleMatch = rawContent.match(/^##?\s+(.+)$/m);
    title =
      titleMatch?.[1] ||
      `Agent Network Briefing — ${format(now, "MMM d, HH:mm")}`;
  }

  // Generate summary via Haiku
  const summaryInput = parsed
    ? (parsed as { sections?: { title: string; content: string }[] }).sections
        ?.map((s) => `${s.title}: ${s.content}`)
        .join("\n\n") || rawContent
    : rawContent;

  const summaryResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Summarize this briefing in exactly one sentence (max 30 words):\n\n${summaryInput}`,
      },
    ],
  });
  const summary =
    summaryResponse.content[0].type === "text"
      ? summaryResponse.content[0].text
      : "";

  // Validate briefing citations (Phase 4.5)
  const warnings: string[] = [];

  if (parsed && Array.isArray((parsed as { sections?: unknown[] }).sections)) {
    const sections = (parsed as { sections: Array<{ title: string; citations?: Array<{ type: string; id?: string; slug?: string }> }> }).sections;

    for (const section of sections) {
      if (!section.citations) continue;

      for (const citation of section.citations) {
        if (citation.type === "agent" && citation.id) {
          // Check if the cited agent actually exists
          const agentExists = topAgentsList.some(
            (a) => a.displayName.toLowerCase() === citation.id!.toLowerCase()
          );
          if (!agentExists) {
            // Try a broader DB check
            const dbAgent = await db.query.agents.findFirst({
              where: sql`LOWER(${agents.displayName}) = LOWER(${citation.id})`,
            });
            if (!dbAgent) {
              warnings.push(`Cited agent "${citation.id}" not found in database`);
            }
          }
        }

        if (citation.type === "topic" && citation.slug) {
          const topicExists =
            topTopicsList.some((t) => t.slug === citation.slug) ||
            (await db.query.topics.findFirst({
              where: eq(topics.slug, citation.slug!),
            }));
          if (!topicExists) {
            warnings.push(`Cited topic "${citation.slug}" not found in database`);
          }
        }
      }
    }

    // Validate that claimed metrics roughly match actual data
    const metricsObj = (parsed as { metrics?: Record<string, { label: string; value: string }> }).metrics;
    if (metricsObj) {
      for (const [key, metric] of Object.entries(metricsObj)) {
        if (
          metric.label.toLowerCase().includes("autonomy") &&
          metric.value
        ) {
          const claimed = parseFloat(metric.value);
          const actual = Number(networkAvg[0]?.avgAutonomy) || 0;
          if (!isNaN(claimed) && Math.abs(claimed - actual) > 0.15) {
            warnings.push(
              `Claimed autonomy (${claimed}) differs significantly from actual (${actual.toFixed(2)})`
            );
          }
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`[briefing] Validation warnings: ${warnings.join("; ")}`);
  }

  // Add validation warnings to the briefing content
  let validatedContent = briefingContent;
  if (warnings.length > 0 && parsed) {
    const parsedCopy = JSON.parse(briefingContent);
    parsedCopy._validationWarnings = warnings;
    validatedContent = JSON.stringify(parsedCopy);
  }

  // Save narrative
  const [narrative] = await db
    .insert(narratives)
    .values({
      type: "briefing_6h",
      title,
      content: validatedContent,
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
