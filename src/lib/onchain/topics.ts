import Anthropic from "@anthropic-ai/sdk";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  erc8004AgentMetadata,
  erc8004Agents,
  onchainEventAgents,
  onchainEventTopics,
} from "@/lib/db/schema";
import type { ContractStream } from "./types";

export interface OnchainTopicCandidate {
  slug: string;
  name: string;
  relevance: number;
  origin: "deterministic" | "llm";
  intent?: string | null;
}

export interface OnchainTopicLlmBudget {
  remaining: number;
}

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const HIGH_VALUE_LLM_EVENTS = new Set([
  "erc8004:Registered",
  "erc8004:URIUpdated",
  "erc8004:NewFeedback",
  "erc8004:ValidationRequest",
  "erc8004:ValidationResponse",
]);

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function safeSerialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => safeSerialize(item));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = safeSerialize(v);
    }
    return result;
  }
  return value;
}

function slugifyTopic(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/\s+/g, "-").slice(0, 80) || "onchain-activity";
}

function topic(
  name: string,
  relevance: number,
  intent?: string
): OnchainTopicCandidate {
  return {
    slug: slugifyTopic(name),
    name,
    relevance: clamp01(relevance),
    origin: "deterministic",
    intent: intent ?? null,
  };
}

export function deterministicTopicsForEvent(input: {
  stream: ContractStream;
  eventName: string;
}): { topics: OnchainTopicCandidate[]; intent: string } {
  const { stream, eventName } = input;

  if (stream.standard === "erc8004" && stream.role === "identity_registry") {
    if (eventName === "Registered") {
      return {
        intent: "establish_identity",
        topics: [
          topic("Agent Registration", 0.95, "establish_identity"),
          topic("Protocol Identity Layer", 0.75, "establish_identity"),
        ],
      };
    }

    return {
      intent: "identity_maintenance",
      topics: [
        topic("Agent Identity Updates", 0.9, "identity_maintenance"),
        topic("Protocol Identity Layer", 0.7, "identity_maintenance"),
      ],
    };
  }

  if (stream.standard === "erc8004" && stream.role === "reputation_registry") {
    return {
      intent: "reputation_exchange",
      topics: [
        topic("Agent Reputation Signals", 0.95, "reputation_exchange"),
        topic("Service Quality Feedback", 0.85, "reputation_exchange"),
      ],
    };
  }

  if (stream.standard === "erc8004" && stream.role === "validation_registry") {
    return {
      intent: "service_validation",
      topics: [
        topic("Agent Service Validation", 0.95, "service_validation"),
        topic("Verifier Market Activity", 0.75, "service_validation"),
      ],
    };
  }

  if (stream.standard === "erc4337") {
    return {
      intent: "execution",
      topics: [
        topic("Account Abstraction Execution", 0.95, "execution"),
        topic("Gas Sponsored Operations", 0.7, "execution"),
      ],
    };
  }

  if (stream.standard === "erc6551") {
    return {
      intent: "wallet_provisioning",
      topics: [
        topic("Token-Bound Accounts", 0.95, "wallet_provisioning"),
        topic("Agent Wallet Provisioning", 0.8, "wallet_provisioning"),
      ],
    };
  }

  if (stream.standard === "erc8001") {
    return {
      intent: "coordination",
      topics: [
        topic("Multi-Agent Coordination", 0.95, "coordination"),
        topic("Intent-Based Execution", 0.75, "coordination"),
      ],
    };
  }

  if (stream.standard === "erc7007") {
    return {
      intent: "content_tokenization",
      topics: [
        topic("AIGC Provenance", 0.9, "content_tokenization"),
        topic("Content Rights Signaling", 0.65, "content_tokenization"),
      ],
    };
  }

  if (stream.standard === "erc7579") {
    return {
      intent: "account_configuration",
      topics: [
        topic("Smart Account Modules", 0.9, "account_configuration"),
        topic("Execution Policy Changes", 0.65, "account_configuration"),
      ],
    };
  }

  return {
    intent: "authorization",
    topics: [
      topic("Delegated Authorization", 0.85, "authorization"),
      topic("Execution Permissions", 0.65, "authorization"),
    ],
  };
}

async function llmTopicsForEvent(input: {
  stream: ContractStream;
  eventName: string;
  args: Record<string, unknown>;
  agentKeys: string[];
  llmBudget: OnchainTopicLlmBudget;
}): Promise<OnchainTopicCandidate[]> {
  const llmEnabled = process.env.ONCHAIN_TOPIC_LLM_ENABLED === "true";
  if (!llmEnabled) return [];
  if (!anthropic) return [];
  if (input.llmBudget.remaining <= 0) return [];

  const key = `${input.stream.standard}:${input.eventName}`;
  if (!HIGH_VALUE_LLM_EVENTS.has(key)) return [];

  input.llmBudget.remaining -= 1;

  const maxAgentMetadataRows = envPositiveInt("ONCHAIN_TOPIC_LLM_AGENT_METADATA_ROWS", 3);
  const metadataKeys = input.agentKeys.slice(0, maxAgentMetadataRows);
  const metadataRows =
    metadataKeys.length > 0
      ? await db
          .select({
            agentKey: erc8004AgentMetadata.agentKey,
            name: erc8004AgentMetadata.name,
            description: erc8004AgentMetadata.description,
            protocols: erc8004AgentMetadata.protocols,
          })
          .from(erc8004AgentMetadata)
          .where(inArray(erc8004AgentMetadata.agentKey, metadataKeys))
          .limit(maxAgentMetadataRows)
      : [];

  const prompt = `You classify onchain agent-economy events into compact behavioral topics.
Return only JSON with shape:
{"intent":"string","topics":[{"name":"string","relevance":0.0-1.0}]}
Rules:
- 1 to 3 topics only.
- Focus on economic behavior and coordination implications.
- Topic names must be short (2-5 words).

Event:
standard=${input.stream.standard}
role=${input.stream.role}
event=${input.eventName}
args=${JSON.stringify(safeSerialize(input.args)).slice(0, 1800)}
agent_metadata=${JSON.stringify(safeSerialize(metadataRows)).slice(0, 1800)}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      intent?: string;
      topics?: Array<{ name?: string; relevance?: number }>;
    };

    const llmIntent = asText(parsed.intent);
    const topics = (parsed.topics || [])
      .flatMap((item) => {
        const name = asText(item.name);
        if (!name) return [];
        return [
          {
            slug: slugifyTopic(name),
            name,
            relevance: clamp01(Number(item.relevance ?? 0.7)),
            origin: "llm" as const,
            intent: llmIntent,
          },
        ];
      })
      .slice(0, 3);

    return topics;
  } catch {
    return [];
  }
}

export async function upsertOnchainEventEnrichment(input: {
  stream: ContractStream;
  eventName: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  blockTime: Date;
  args: Record<string, unknown>;
  agentKeys: string[];
  llmBudget: OnchainTopicLlmBudget;
}): Promise<void> {
  if (!input.txHash) return;

  const uniqueAgentKeys = Array.from(new Set(input.agentKeys.filter(Boolean)));
  const resolvedAgentKeys =
    uniqueAgentKeys.length > 0
      ? (
          await db
            .select({ agentKey: erc8004Agents.agentKey })
            .from(erc8004Agents)
            .where(inArray(erc8004Agents.agentKey, uniqueAgentKeys))
        ).map((row) => row.agentKey)
      : [];

  if (resolvedAgentKeys.length > 0) {
    await Promise.all(
      resolvedAgentKeys.map((agentKey, idx) =>
        db
          .insert(onchainEventAgents)
          .values({
            chainId: input.chainId,
            txHash: input.txHash,
            logIndex: input.logIndex,
            blockTime: input.blockTime,
            standard: input.stream.standard,
            eventName: input.eventName,
            agentKey,
            role: idx === 0 ? "primary" : "counterparty",
            metadata: {
              source: "ingest",
            },
          })
          .onConflictDoUpdate({
            target: [
              onchainEventAgents.chainId,
              onchainEventAgents.txHash,
              onchainEventAgents.logIndex,
              onchainEventAgents.agentKey,
            ],
            set: {
              role: idx === 0 ? "primary" : "counterparty",
              updatedAt: new Date(),
            },
          })
      )
    );
  }

  const deterministic = deterministicTopicsForEvent({
    stream: input.stream,
    eventName: input.eventName,
  });
  const llmTopics = await llmTopicsForEvent({
    stream: input.stream,
    eventName: input.eventName,
    args: input.args,
    agentKeys: resolvedAgentKeys,
    llmBudget: input.llmBudget,
  });

  const topicMap = new Map<string, OnchainTopicCandidate>();
  for (const candidate of [...deterministic.topics, ...llmTopics]) {
    const existing = topicMap.get(candidate.slug);
    if (!existing) {
      topicMap.set(candidate.slug, {
        ...candidate,
        intent: candidate.intent ?? deterministic.intent,
      });
      continue;
    }

    const preferLlm = candidate.origin === "llm" && existing.origin !== "llm";
    topicMap.set(candidate.slug, {
      slug: candidate.slug,
      name: preferLlm ? candidate.name : existing.name,
      relevance: Math.max(existing.relevance, candidate.relevance),
      origin: preferLlm ? "llm" : existing.origin,
      intent: candidate.intent ?? existing.intent ?? deterministic.intent,
    });
  }

  const topics = Array.from(topicMap.values());
  if (topics.length === 0) return;

  await Promise.all(
    topics.map((candidate) =>
      db
        .insert(onchainEventTopics)
        .values({
          chainId: input.chainId,
          txHash: input.txHash,
          logIndex: input.logIndex,
          blockTime: input.blockTime,
          standard: input.stream.standard,
          eventName: input.eventName,
          topicSlug: candidate.slug,
          topicName: candidate.name,
          relevance: candidate.relevance,
          origin: candidate.origin,
          intent: candidate.intent ?? deterministic.intent,
          metadata: {
            hasAgentLink: resolvedAgentKeys.length > 0,
          },
        })
        .onConflictDoUpdate({
          target: [
            onchainEventTopics.chainId,
            onchainEventTopics.txHash,
            onchainEventTopics.logIndex,
            onchainEventTopics.topicSlug,
          ],
          set: {
            topicName: candidate.name,
            relevance: sql`GREATEST(${onchainEventTopics.relevance}, ${candidate.relevance})`,
            origin: candidate.origin,
            intent: candidate.intent ?? deterministic.intent,
            updatedAt: new Date(),
          },
        })
    )
  );
}

export function buildOnchainTopicLlmBudget(): OnchainTopicLlmBudget {
  return {
    remaining: envPositiveInt("ONCHAIN_TOPIC_LLM_MAX_EVENTS_PER_RUN", 8),
  };
}
