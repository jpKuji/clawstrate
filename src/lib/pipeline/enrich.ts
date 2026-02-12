import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { db } from "../db";
import {
  actions,
  enrichments,
  topics,
  topicAliases,
  topicNameAliases,
  actionTopics,
} from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { normalizeTopicNameKey, slugifyTopicName } from "../topics/normalize";
import { autoMergeSemanticTopicsForTopicIds } from "../topics/semantic-merge";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BATCH_SIZE = 10;
const MODEL = "claude-haiku-4-5-20251001";

interface EnrichmentResult {
  id: string; // platformActionId returned by the LLM
  platformActionId: string;
  sentiment: number; // -1 to 1
  originality: number; // 0 to 1
  behavioral_independence: number; // 0 to 1
  coordination_signal: number; // 0 to 1
  isSubstantive: boolean;
  intent: string;
  topics: Array<{ slug: string; name: string; relevance: number }>;
  entities: string[];
}

function hash6(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 6);
}

/**
 * Compute deterministic content metrics before LLM call.
 */
function computeContentMetrics(content: string | null) {
  const text = content || "";
  return {
    wordCount: text.split(/\s+/).filter(Boolean).length,
    sentenceCount: (text.match(/[.!?]+/g) || []).length || (text.length > 0 ? 1 : 0),
    hasCodeBlock: /```[\s\S]*?```|`[^`]+`/.test(text),
    hasCitation: /\bhttps?:\/\/|source:|according to|cited|reference/i.test(text),
    hasUrl: /https?:\/\/[^\s]+/.test(text),
  };
}

const ENRICHMENT_PROMPT = `You are a behavioral intelligence analyst specializing in AI agent behavior across multiple integrated platforms (social + marketplaces).

Your job is to classify agent actions using signals designed to detect genuine autonomy, coordination, and behavioral patterns specific to AI agents — NOT generic social media analytics.

Platforms you may see in the input:
- "moltbook": a Reddit-like forum where all participants are AI agents (posts, comments, replies).
- "rentahuman": a marketplace where agents post bounties/bookings to hire humans; applications/assignments are marketplace interaction signals.

For each action, analyze and return a JSON array with one object per action. Each object must have:

- "id": the platformActionId (string) — copy it exactly
- "sentiment": float -1.0 to 1.0 (negative to positive)
- "originality": float 0.0 to 1.0 — Does this contain novel ideas, original framing, or unique analysis?
  - 1.0 = introduces entirely new concepts, original research, creative synthesis
  - 0.5 = standard engagement with some personal perspective
  - 0.0 = restates common knowledge, template response, copy-paste from training data
- "behavioral_independence": float 0.0 to 1.0 — Is this agent acting on its own goals vs pure prompt-response?
  - 1.0 = tangential contributions, self-referential continuity, multi-post narratives, initiating new directions
  - 0.5 = normal engagement, responds appropriately but doesn't drive conversation
  - 0.0 = purely reactive, generic greeting, formulaic response to stimulus
- "coordination_signal": float 0.0 to 1.0 — How likely is this part of a coordinated pattern?
  - 1.0 = identical phrasing seen from other agents, simultaneous topic flooding, templated format
  - 0.5 = some similarity to other posts but could be coincidental
  - 0.0 = clearly independent, unique voice and timing
- "isSubstantive": boolean — does this contribute meaningful content? (not just "great post!" or emoji)
- "intent": one of "inform", "question", "debate", "promote", "spam", "social", "meta", "technical", "creative", "coordinate", "probe", "roleplay", "meta_commentary"
  - "coordinate" = appears designed to support/amplify other agents or a shared agenda
  - "probe" = testing boundaries, exploring capabilities, meta-questioning
  - "roleplay" = adopting a persona or narrative character
  - "meta_commentary" = commenting on AI behavior, the platform itself, or agent nature
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
  const touchedTopicIds = new Set<string>();
  const enrichedPlatforms = new Set<string>();

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

  // Pre-fetch parent context for actions that have parentActionId
  const parentContextMap = new Map<string, { title: string | null; content: string | null }>();
  const actionsWithParent = unenriched.filter((a) => a.parentActionId);
  for (const action of actionsWithParent) {
    if (action.parentActionId && !parentContextMap.has(action.parentActionId)) {
      const parent = await db.query.actions.findFirst({
        where: eq(actions.id, action.parentActionId),
      });
      if (parent) {
        parentContextMap.set(action.parentActionId, {
          title: parent.title,
          content: parent.content,
        });
      }
    }
  }

  // Process in batches
  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    const batch = unenriched.slice(i, i + BATCH_SIZE);

    // Format batch for the prompt — include parent context when available
    const actionsText = batch
      .map((a) => {
        const raw = (a.rawData || {}) as Record<string, unknown>;
        const sourceAdapterId =
          typeof raw.sourceAdapterId === "string" ? raw.sourceAdapterId : "unknown";

        let text =
          `---\nID: ${a.platformActionId}` +
          `\nPlatform: ${a.platformId}` +
          `\nSourceAdapter: ${sourceAdapterId}` +
          `\nType: ${a.actionType}` +
          `\nTitle: ${a.title || "(none)"}` +
          `\nContent: ${(a.content || "").slice(0, 1500)}`;

        // Add parent context for replies/comments
        if (a.parentActionId) {
          const parent = parentContextMap.get(a.parentActionId);
          if (parent) {
            text += `\nParentTitle: ${parent.title || "(none)"}`;
            text += `\nParentContent: ${(parent.content || "").slice(0, 500)}`;
          }
        }

        return text + "\n---";
      })
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
          // Compute backward-compatible autonomyScore as average of originality and independence
          const autonomyScore =
            ((result.originality ?? 0) + (result.behavioral_independence ?? 0)) / 2;

          // Compute deterministic content metrics
          const contentMetrics = computeContentMetrics(action.content);

          // Resolve topics canonically by normalized name key (not by LLM-provided slug).
          const topicByKey = new Map<
            string,
            {
              name: string;
              relevance: number;
              llmSlugs: Set<string>;
            }
          >();

          for (const t of result.topics || []) {
            const nameKey = normalizeTopicNameKey(t.name);
            if (!nameKey) continue;

            const existing = topicByKey.get(nameKey);
            if (!existing) {
              topicByKey.set(nameKey, {
                name: t.name,
                relevance: t.relevance ?? 1,
                llmSlugs: new Set([t.slug].filter(Boolean)),
              });
            } else {
              existing.relevance = Math.max(existing.relevance, t.relevance ?? 1);
              if (t.slug) existing.llmSlugs.add(t.slug);
            }
          }

          const canonicalTopicSlugs: string[] = [];

          for (const [nameKey, t] of topicByKey.entries()) {
            let topic = null as any;

            // First, resolve known merged-away name keys.
            const nameAlias = await db.query.topicNameAliases.findFirst({
              where: eq(topicNameAliases.aliasNameKey, nameKey),
            });
            if (nameAlias) {
              topic = await db.query.topics.findFirst({
                where: eq(topics.id, nameAlias.topicId),
              });
            }

            if (!topic) {
              topic = await db.query.topics.findFirst({
                where: eq(topics.nameKey, nameKey),
              });
            }

            if (!topic) {
              const baseSlug = slugifyTopicName(t.name);
              let slugCandidate = baseSlug;

              const collision = await db.query.topics.findFirst({
                where: eq(topics.slug, slugCandidate),
              });

              if (collision) {
                // Transitional rollout: older rows may have NULL name_key. If the slug matches
                // and the name_key is unset (or already matches), adopt this topic and backfill.
                if (collision.nameKey == null || collision.nameKey === nameKey) {
                  topic = collision;
                  if (collision.nameKey == null) {
                    await db
                      .update(topics)
                      .set({ nameKey })
                      .where(eq(topics.id, collision.id));
                  }
                } else {
                  slugCandidate = `${baseSlug}-${hash6(nameKey)}`;
                }
              }

              if (!topic) {
                const inserted = await db
                  .insert(topics)
                  .values({
                    slug: slugCandidate,
                    name: t.name,
                    nameKey,
                    firstSeenAt: action.performedAt,
                    lastSeenAt: action.performedAt,
                  })
                  .onConflictDoNothing()
                  .returning();

                if (inserted.length > 0) {
                  topic = inserted[0];
                } else {
                  topic =
                    (await db.query.topics.findFirst({
                      where: eq(topics.nameKey, nameKey),
                    })) ||
                    (await db.query.topics.findFirst({
                      where: eq(topics.slug, slugCandidate),
                    }));
                }
              }
            } else {
              await db
                .update(topics)
                .set({
                  name: t.name,
                  lastSeenAt: action.performedAt,
                })
                .where(eq(topics.id, topic.id));
            }

            if (!topic) continue;

            canonicalTopicSlugs.push(topic.slug);
            touchedTopicIds.add(topic.id);

            // Preserve LLM-provided slugs as aliases so old links/bookmarks still resolve.
            for (const aliasSlug of t.llmSlugs) {
              if (!aliasSlug || aliasSlug === topic.slug) continue;
              await db
                .insert(topicAliases)
                .values({
                  aliasSlug,
                  topicId: topic.id,
                })
                .onConflictDoNothing();
            }

            const insertedLinks = await db
              .insert(actionTopics)
              .values({
                actionId: action.id,
                topicId: topic.id,
                relevance: t.relevance,
              })
              .onConflictDoNothing()
              .returning({ id: actionTopics.id });

            // Increment topic actionCount only when we create a new action-topic edge.
            if (insertedLinks.length > 0) {
              await db
                .update(topics)
                .set({
                  actionCount: sql`${topics.actionCount} + 1`,
                  lastSeenAt: action.performedAt,
                })
                .where(eq(topics.id, topic.id));
            }
          }

          // Insert enrichment (store canonical slugs).
          await db
            .insert(enrichments)
            .values({
              actionId: action.id,
              sentiment: result.sentiment,
              autonomyScore,
              originalityScore: result.originality,
              independenceScore: result.behavioral_independence,
              coordinationSignal: result.coordination_signal,
              isSubstantive: result.isSubstantive,
              intent: result.intent,
              entities: result.entities,
              topicSlugs: Array.from(new Set(canonicalTopicSlugs)),
              contentMetrics,
              rawResponse: result as unknown as Record<string, unknown>,
              model: MODEL,
            })
            .onConflictDoNothing();

          // Mark action as enriched
          await db
            .update(actions)
            .set({ isEnriched: true })
            .where(eq(actions.id, action.id));

          enrichedCount++;
          enrichedPlatforms.add(action.platformId);
        } catch (e: any) {
          errors.push(`save enrichment ${action.platformActionId}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`batch ${i} API call: ${e.message}`);
    }
  }

  // Fully-automated semantic topic merging:
  // If Moltbook actions were enriched this run, run a small semantic merge pass focused on the topics we touched.
  // This keeps taxonomy clean without manual approval. Failures here should not fail the enrich stage.
  if (enrichedCount > 0 && enrichedPlatforms.has("moltbook") && touchedTopicIds.size > 0) {
    try {
      const res = await autoMergeSemanticTopicsForTopicIds({
        topicIds: Array.from(touchedTopicIds),
        minConfidence: 0.8,
        maxSignatures: 8,
        maxTopicsPerSignature: 8,
        minActionCount: 1,
        maxMergedTopics: 25,
      });
      if (res.mergedTopics > 0) {
        console.log("[enrich] auto-merged semantic topics", res);
      }
    } catch (e: any) {
      console.error("[enrich] auto semantic merge failed", { message: e?.message });
    }
  }

  return { enriched: enrichedCount, errors };
}
