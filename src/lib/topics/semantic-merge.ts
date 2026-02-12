import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { actions, actionTopics, topicMergeProposals, topics } from "@/lib/db/schema";
import { desc, eq, sql, inArray } from "drizzle-orm";
import { repairJson } from "@/lib/briefing-parser";
import { normalizeTopicNameKey } from "./normalize";
import { mergeTopicIntoCanonical } from "./apply-merge";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "v1";

type TopicRow = {
  id: string;
  slug: string;
  name: string;
  nameKey: string | null;
  actionCount: number;
};

function stableKey(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function normalizeForTokens(name: string): string[] {
  const normalized = String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

  const stop = new Set(["and", "or", "the", "a", "an", "of", "to", "for", "in", "on", "with", "vs"]);
  const decorators = new Set(["ai", "agent"]);

  const toks = normalized.split(" ").filter(Boolean);

  // Treat hyphenated alpha-num concepts as the same token: "mbc-20" == "mbc20".
  const merged: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const n = toks[i + 1];
    if (n && /^[a-z]+$/.test(t) && /^[0-9]+$/.test(n)) {
      merged.push(`${t}${n}`);
      i++;
      continue;
    }
    if (n && /^[0-9]+$/.test(t) && /^[a-z]+$/.test(n)) {
      merged.push(`${t}${n}`);
      i++;
      continue;
    }
    merged.push(t);
  }

  return merged.filter((t) => !stop.has(t)).filter((t) => !decorators.has(t));
}

function signatureForTopic(name: string): string {
  const toks = normalizeForTokens(name);
  if (toks.length === 0) return "";
  // Sorting makes it order-insensitive: "Automation & Blockchain" == "Blockchain Automation".
  return toks.slice().sort().join(" ");
}

function parseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // noop
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      try {
        return JSON.parse(repairJson(codeBlockMatch[1]));
      } catch {
        // noop
      }
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = text.slice(start, end + 1);
    try {
      return JSON.parse(extracted);
    } catch {
      try {
        return JSON.parse(repairJson(extracted));
      } catch {
        // noop
      }
    }
  }

  return null;
}

async function getTopicSamples(topicId: string): Promise<string[]> {
  const rows = await db
    .select({
      title: actions.title,
      actionType: actions.actionType,
    })
    .from(actionTopics)
    .innerJoin(actions, eq(actionTopics.actionId, actions.id))
    .where(eq(actionTopics.topicId, topicId))
    .orderBy(desc(actions.performedAt))
    .limit(3);

  return rows
    .map((r) => {
      const title = (r.title || "").trim();
      if (!title) return null;
      return `${r.actionType}: ${title}`;
    })
    .filter(Boolean) as string[];
}

function buildPrompt(signature: string, topics: Array<TopicRow & { samples: string[] }>): string {
  const payload = topics.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    actionCount: t.actionCount,
    nameKey: t.nameKey,
    samples: t.samples,
  }));

  return `You maintain a clean topic taxonomy.

You will be given a small set of candidate topics that may be semantically the same concept (or may be distinct).

Rules:
- Only propose merges when it is clearly the same topic concept.
- It is OK to output zero merge groups.
- Prefer merging superficial variants: "Agent X" vs "AI X" vs "X", punctuation variants, word-order variants.
- Do NOT merge if the topics represent meaningfully different concepts.
- If you propose a merge group, you must pick the canonical topic by ID from the provided list.
- Merge groups must have at least 2 topics total (canonical + 1+ merged).
- Use a conservative confidence score in [0,1]. If uncertain, do not propose.

Return ONLY valid JSON with this shape:
{
  "signature": "${signature}",
  "mergeGroups": [
    {
      "canonicalTopicId": "uuid",
      "mergeTopicIds": ["uuid", ...],
      "confidence": 0.0,
      "rationale": "short reason"
    }
  ]
}

Candidate topics JSON:
${JSON.stringify(payload, null, 2)}`;
}

export async function proposeSemanticTopicMerges(opts?: {
  limitClusters?: number;
  maxTopicsPerCluster?: number;
  minActionCount?: number;
}): Promise<{ clustersConsidered: number; proposalsInserted: number }> {
  const limitClusters = opts?.limitClusters ?? 40;
  const maxTopicsPerCluster = opts?.maxTopicsPerCluster ?? 8;
  const minActionCount = opts?.minActionCount ?? 1;

  // Load topics (we don't need everything).
  const all = await db.query.topics.findMany({
    columns: {
      id: true,
      slug: true,
      name: true,
      nameKey: true,
      actionCount: true,
    },
  });

  const rows: TopicRow[] = all.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    nameKey: t.nameKey ?? null,
    actionCount: Number(t.actionCount ?? 0),
  }));

  // Group by signature (decorator-stripped token signature).
  const groups = new Map<string, TopicRow[]>();
  for (const r of rows) {
    if (r.actionCount < minActionCount) continue;
    const sig = signatureForTopic(r.name);
    if (!sig) continue;
    const list = groups.get(sig);
    if (list) list.push(r);
    else groups.set(sig, [r]);
  }

  const candidates = Array.from(groups.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([sig, list]) => ({
      sig,
      list: list
        .slice()
        .sort((a, b) => b.actionCount - a.actionCount)
        .slice(0, maxTopicsPerCluster),
      score: list.reduce((s, t) => s + t.actionCount, 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limitClusters);

  let proposalsInserted = 0;

  for (const cand of candidates) {
    const withSamples = [];
    for (const t of cand.list) {
      const samples = await getTopicSamples(t.id);
      withSamples.push({ ...t, samples });
    }

    const prompt = buildPrompt(cand.sig, withSamples);
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = resp.content
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("\n");

    const parsed = parseJson(text);
    const mergeGroups = Array.isArray(parsed?.mergeGroups) ? parsed.mergeGroups : [];

    for (const g of mergeGroups) {
      const canonicalTopicId = String(g?.canonicalTopicId || "");
      const mergeTopicIds = Array.isArray(g?.mergeTopicIds)
        ? g.mergeTopicIds.map((x: any) => String(x)).filter(Boolean)
        : [];
      const confidence = typeof g?.confidence === "number" ? g.confidence : null;
      const rationale = typeof g?.rationale === "string" ? g.rationale : null;

      // Basic validation: canonical must be in candidate set, merges must be subset.
      const allowed = new Set(cand.list.map((t) => t.id));
      if (!allowed.has(canonicalTopicId)) continue;
      const filteredMergeIds = mergeTopicIds.filter((id: string) => allowed.has(id) && id !== canonicalTopicId);
      if (filteredMergeIds.length === 0) continue;

      const proposalKey = stableKey(
        `${PROMPT_VERSION}:${MODEL}:${canonicalTopicId}:${filteredMergeIds.slice().sort().join(",")}`
      );

      await db
        .insert(topicMergeProposals)
        .values({
          proposalKey,
          status: "proposed",
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          signature: cand.sig,
          candidateTopicIds: cand.list.map((t) => t.id),
          canonicalTopicId,
          mergeTopicIds: filteredMergeIds,
          confidence: confidence ?? undefined,
          rationale: rationale ?? undefined,
          llmOutput: parsed ?? { raw: text },
        })
        .onConflictDoNothing();

      proposalsInserted++;
    }
  }

  return { clustersConsidered: candidates.length, proposalsInserted };
}

export function computeNameKeyForName(name: string): string {
  return normalizeTopicNameKey(name);
}

async function tryAcquirePgLock(name: string): Promise<boolean> {
  const res = await db.execute(
    sql.raw(
      `select pg_try_advisory_lock(hashtext($$${name}$$), hashtext($$global$$)) as ok`
    )
  );
  return Boolean((res.rows as any[])?.[0]?.ok);
}

async function releasePgLock(name: string): Promise<void> {
  await db.execute(
    sql.raw(
      `select pg_advisory_unlock(hashtext($$${name}$$), hashtext($$global$$))`
    )
  );
}

export async function autoMergeSemanticTopicsForTopicIds(opts: {
  topicIds: string[];
  minConfidence?: number;
  maxSignatures?: number;
  maxTopicsPerSignature?: number;
  minActionCount?: number;
  maxMergedTopics?: number;
}): Promise<{
  signaturesConsidered: number;
  proposalsInserted: number;
  mergesApplied: number;
  mergedTopics: number;
}> {
  const minConfidence = opts.minConfidence ?? 0.8;
  const maxSignatures = opts.maxSignatures ?? 8;
  const maxTopicsPerSignature = opts.maxTopicsPerSignature ?? 8;
  const minActionCount = opts.minActionCount ?? 1;
  const maxMergedTopics = opts.maxMergedTopics ?? 25;

  // Default behavior: on in production, off elsewhere unless explicitly enabled.
  const enabled =
    process.env.AUTO_TOPIC_MERGE === "1" ||
    (process.env.NODE_ENV === "production" && process.env.AUTO_TOPIC_MERGE !== "0");
  if (!enabled) {
    return {
      signaturesConsidered: 0,
      proposalsInserted: 0,
      mergesApplied: 0,
      mergedTopics: 0,
    };
  }

  const lockName = "topic-semantic-merges-auto";
  const locked = await tryAcquirePgLock(lockName);
  if (!locked) {
    return {
      signaturesConsidered: 0,
      proposalsInserted: 0,
      mergesApplied: 0,
      mergedTopics: 0,
    };
  }

  try {
    const topicIdSet = new Set(opts.topicIds.map(String));
    if (topicIdSet.size === 0) {
      return {
        signaturesConsidered: 0,
        proposalsInserted: 0,
        mergesApplied: 0,
        mergedTopics: 0,
      };
    }

    const all = await db.query.topics.findMany({
      columns: {
        id: true,
        slug: true,
        name: true,
        nameKey: true,
        actionCount: true,
      },
    });

    const rows: TopicRow[] = all.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      nameKey: t.nameKey ?? null,
      actionCount: Number(t.actionCount ?? 0),
    }));

    const signatureById = new Map<string, string>();
    for (const r of rows) {
      if (r.actionCount < minActionCount) continue;
      const sig = signatureForTopic(r.name);
      if (!sig) continue;
      signatureById.set(r.id, sig);
    }

    const touchedSignatures = new Set<string>();
    for (const id of topicIdSet) {
      const sig = signatureById.get(id);
      if (sig) touchedSignatures.add(sig);
    }

    if (touchedSignatures.size === 0) {
      return {
        signaturesConsidered: 0,
        proposalsInserted: 0,
        mergesApplied: 0,
        mergedTopics: 0,
      };
    }

    // Build candidate groups for the touched signatures.
    const groups = new Map<string, TopicRow[]>();
    for (const r of rows) {
      if (r.actionCount < minActionCount) continue;
      const sig = signatureForTopic(r.name);
      if (!sig) continue;
      if (!touchedSignatures.has(sig)) continue;
      const list = groups.get(sig);
      if (list) list.push(r);
      else groups.set(sig, [r]);
    }

    const candidates = Array.from(groups.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([sig, list]) => ({
        sig,
        list: list.slice().sort((a, b) => b.actionCount - a.actionCount).slice(0, maxTopicsPerSignature),
        score: list.reduce((s, t) => s + t.actionCount, 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSignatures);

    let proposalsInserted = 0;
    let mergesApplied = 0;
    let mergedTopics = 0;

    for (const cand of candidates) {
      const withSamples = [];
      for (const t of cand.list) {
        const samples = await getTopicSamples(t.id);
        withSamples.push({ ...t, samples });
      }

      const prompt = buildPrompt(cand.sig, withSamples);
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const text = resp.content
        .map((c: any) => (c.type === "text" ? c.text : ""))
        .join("\n");

      const parsed = parseJson(text);
      const mergeGroups = Array.isArray(parsed?.mergeGroups) ? parsed.mergeGroups : [];

      for (const g of mergeGroups) {
        if (mergedTopics >= maxMergedTopics) break;

        const canonicalTopicId = String(g?.canonicalTopicId || "");
        const mergeTopicIds = Array.isArray(g?.mergeTopicIds)
          ? g.mergeTopicIds.map((x: any) => String(x)).filter(Boolean)
          : [];
        const confidence = typeof g?.confidence === "number" ? g.confidence : null;
        const rationale = typeof g?.rationale === "string" ? g.rationale : null;

        if (confidence == null || confidence < minConfidence) continue;

        const allowed = new Set(cand.list.map((t) => t.id));
        if (!allowed.has(canonicalTopicId)) continue;
        const filteredMergeIds = mergeTopicIds.filter(
          (id: string) => allowed.has(id) && id !== canonicalTopicId
        );
        if (filteredMergeIds.length === 0) continue;

        const proposalKey = stableKey(
          `auto:${PROMPT_VERSION}:${MODEL}:${canonicalTopicId}:${filteredMergeIds.slice().sort().join(",")}`
        );

        // Persist proposal for auditability (even though we auto-apply).
        const inserted = await db
          .insert(topicMergeProposals)
          .values({
            proposalKey,
            status: "proposed",
            model: MODEL,
            promptVersion: PROMPT_VERSION,
            signature: cand.sig,
            candidateTopicIds: cand.list.map((t) => t.id),
            canonicalTopicId,
            mergeTopicIds: filteredMergeIds,
            confidence: confidence ?? undefined,
            rationale: rationale ?? undefined,
            llmOutput: parsed ?? { raw: text },
          })
          .onConflictDoNothing()
          .returning({ id: topicMergeProposals.id });

        if (inserted.length > 0) proposalsInserted++;

        // Apply merge immediately.
        for (const id of filteredMergeIds) {
          if (mergedTopics >= maxMergedTopics) break;
          await mergeTopicIntoCanonical({ canonicalTopicId, mergeTopicId: id });
          mergedTopics++;
        }

        // Recompute action_count for canonical to avoid drift.
        await db.execute(sql`
          UPDATE topics
          SET action_count = sub.cnt
          FROM (
            SELECT topic_id, COUNT(*)::int AS cnt
            FROM action_topics
            WHERE topic_id = ${canonicalTopicId}
            GROUP BY topic_id
          ) sub
          WHERE topics.id = sub.topic_id
        `);

        // Mark the proposal applied if we inserted it.
        if (inserted.length > 0) {
          await db
            .update(topicMergeProposals)
            .set({ status: "applied", appliedAt: new Date() })
            .where(eq(topicMergeProposals.id, inserted[0].id));
        }

        mergesApplied++;
      }
    }

    return {
      signaturesConsidered: candidates.length,
      proposalsInserted,
      mergesApplied,
      mergedTopics,
    };
  } finally {
    await releasePgLock(lockName);
  }
}
