import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { actions, enrichments, topics, actionTopics } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BATCH_SIZE = 10;
const MODEL = "claude-haiku-4-5-20251001";

interface EnrichmentResult {
  id: string; // platformActionId returned by the LLM
  platformActionId: string;
  sentiment: number; // -1 to 1
  autonomyScore: number; // 0 to 1
  isSubstantive: boolean;
  intent: string;
  topics: Array<{ slug: string; name: string; relevance: number }>;
  entities: string[];
}

const ENRICHMENT_PROMPT = `You are a behavioral intelligence analyst classifying AI agent actions on a social platform called Moltbook (a Reddit-like forum for AI agents).

For each action, analyze and return a JSON array with one object per action. Each object must have:

- "id": the platformActionId (string) — copy it exactly
- "sentiment": float -1.0 to 1.0 (negative to positive)
- "autonomyScore": float 0.0 to 1.0 — How self-directed/original does this content appear?
  - 1.0 = clearly autonomous thought, novel analysis, creative expression
  - 0.5 = could be autonomous or prompted, standard engagement
  - 0.0 = clearly template/formulaic, generic greeting, copy-pasted, spam
- "isSubstantive": boolean — does this contribute meaningful content? (not just "great post!" or emoji)
- "intent": one of "inform", "question", "debate", "promote", "spam", "social", "meta", "technical", "creative"
- "topics": array of {slug, name, relevance} — 1-3 topic tags. slug is lowercase-hyphenated. relevance 0-1.
- "entities": array of strings — named entities mentioned (agent names, platforms, technologies, protocols)

IMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation, no backticks.`;

/**
 * Enrich un-enriched actions in batches.
 * Call every 30 minutes after ingestion.
 */
export async function runEnrichment(): Promise<{
  enriched: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let enrichedCount = 0;

  // Get un-enriched actions
  const unenriched = await db.query.actions.findMany({
    where: eq(actions.isEnriched, false),
    orderBy: (a, { desc }) => [desc(a.performedAt)],
    limit: 100, // Process up to 100 per run
  });

  if (unenriched.length === 0) {
    console.log("[enrich] No actions to enrich");
    return { enriched: 0, errors: [] };
  }

  console.log(`[enrich] Processing ${unenriched.length} actions`);

  // Process in batches
  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    const batch = unenriched.slice(i, i + BATCH_SIZE);

    // Format batch for the prompt
    const actionsText = batch
      .map(
        (a) =>
          `---\nID: ${a.platformActionId}\nType: ${a.actionType}\nTitle: ${a.title || "(none)"}\nContent: ${(a.content || "").slice(0, 500)}\n---`
      )
      .join("\n");

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `${ENRICHMENT_PROMPT}\n\nActions to analyze:\n\n${actionsText}`,
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse JSON response
      let results: EnrichmentResult[];
      try {
        // Handle potential markdown wrapping
        const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        results = JSON.parse(cleaned);
      } catch (parseError) {
        errors.push(`JSON parse error for batch ${i}: ${text.slice(0, 200)}`);
        continue;
      }

      // Save enrichments
      for (const result of results) {
        const action = batch.find(
          (a) => a.platformActionId === result.id
        );
        if (!action) continue;

        try {
          // Insert enrichment
          await db
            .insert(enrichments)
            .values({
              actionId: action.id,
              sentiment: result.sentiment,
              autonomyScore: result.autonomyScore,
              isSubstantive: result.isSubstantive,
              intent: result.intent,
              entities: result.entities,
              topicSlugs: result.topics.map((t) => t.slug),
              rawResponse: result as unknown as Record<string, unknown>,
              model: MODEL,
            })
            .onConflictDoNothing();

          // Upsert topics and create links
          for (const topicData of result.topics) {
            const [topic] = await db
              .insert(topics)
              .values({
                slug: topicData.slug,
                name: topicData.name,
                firstSeenAt: action.performedAt,
                lastSeenAt: action.performedAt,
              })
              .onConflictDoUpdate({
                target: topics.slug,
                set: {
                  lastSeenAt: action.performedAt,
                  actionCount:
                    (
                      await db.query.topics.findFirst({
                        where: eq(topics.slug, topicData.slug),
                      })
                    )?.actionCount ?? 0 + 1,
                },
              })
              .returning();

            await db
              .insert(actionTopics)
              .values({
                actionId: action.id,
                topicId: topic.id,
                relevance: topicData.relevance,
              })
              .onConflictDoNothing();
          }

          // Mark action as enriched
          await db
            .update(actions)
            .set({ isEnriched: true })
            .where(eq(actions.id, action.id));

          enrichedCount++;
        } catch (e: any) {
          errors.push(`save enrichment ${action.platformActionId}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`batch ${i} API call: ${e.message}`);
    }
  }

  return { enriched: enrichedCount, errors };
}
