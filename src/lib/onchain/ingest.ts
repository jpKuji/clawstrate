import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eip7702Authorizations,
  erc4337UserOps,
  erc6551Accounts,
  erc7007AigcEvents,
  erc7579ModuleEvents,
  erc8001Coordinations,
  erc8004AgentMetadata,
  erc8004Agents,
  erc8004FeedbackResponses,
  erc8004Feedbacks,
  erc8004Validations,
  onchainChains,
  onchainContracts,
  onchainIngestDeadLetters,
  onchainEventLogs,
  pipelineStageCursors,
} from "@/lib/db/schema";
import { buildRpcUrlList, getPublicClient } from "./clients";
import { shouldPersist4337Log } from "./erc4337-filter";
import { parseAgentMetadataFromUri } from "./metadata-parser";
import {
  buildContractStreams,
  getOnchainManifest,
  makeAgentKey,
  parseEventAbi,
  streamScope,
  toDateFromUnix,
} from "./normalize";
import type { ChainId, ChainManifestEntry, ContractStream, OnchainIngestResult } from "./types";
import {
  buildOnchainTopicLlmBudget,
  type OnchainTopicLlmBudget,
  upsertOnchainEventEnrichment,
} from "./topics";

const STAGE_NAME = "onchain";
const REORG_WINDOW = 12;
const MAX_BLOCKS_PER_STREAM = 3_000;
const MAX_BLOCKS_EIP7702 = 120;

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const RPC_CALL_TIMEOUT_MS = envPositiveInt("ONCHAIN_RPC_CALL_TIMEOUT_MS", 30_000);
const STREAM_PROCESS_TIMEOUT_MS = envPositiveInt("ONCHAIN_STREAM_TIMEOUT_MS", 75_000);
const RUN_BUDGET_MS = envPositiveInt("ONCHAIN_RUN_BUDGET_MS", 260_000);
const STREAM_MIN_REMAINING_MS = envPositiveInt("ONCHAIN_STREAM_MIN_REMAINING_MS", 1_500);
const LOG_LOOP_GUARD_MS = envPositiveInt("ONCHAIN_LOG_LOOP_GUARD_MS", 400);
const ERROR_MAX_LEN = envPositiveInt("ONCHAIN_ERROR_MAX_LEN", 500);
const ERROR_MAX_ITEMS_PER_STREAM = envPositiveInt("ONCHAIN_ERROR_MAX_ITEMS_PER_STREAM", 20);
const ERC4337_SENDER_CHUNK_SIZE = envPositiveInt("ONCHAIN_4337_SENDER_CHUNK_SIZE", 50);

interface StreamRange {
  fromBlock: number;
  toBlock: number;
}

interface IngestStreamResult {
  scope: string;
  chainId: ChainId;
  standard: ContractStream["standard"];
  eventName: string;
  logsFetched: number;
  logsPersisted: number;
  logsSkippedByAgentFilter: number;
  logsFailed: number;
  fromBlock: number | null;
  toBlock: number | null;
  errors: string[];
}

function asNum(value: bigint | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeAddress(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const lowered = text.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lowered) ? lowered : null;
}

function clampErrorMessage(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input ?? "unknown_error");
  const sanitized = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (sanitized.length <= ERROR_MAX_LEN) return sanitized;
  return `${sanitized.slice(0, ERROR_MAX_LEN)}...`;
}

function safeSerializeForStorage(value: unknown, maxChars: number = 2_000): Record<string, unknown> {
  const serialized = safeSerialize(value);
  try {
    const text = JSON.stringify(serialized);
    if (!text) return {};
    if (text.length <= maxChars) return JSON.parse(text) as Record<string, unknown>;
    return {
      truncated: true,
      maxChars,
      preview: `${text.slice(0, maxChars)}...`,
    };
  } catch {
    return { truncated: true, reason: "json_serialize_failed" };
  }
}

function remainingMs(deadlineMs: number): number {
  return deadlineMs - Date.now();
}

function timeoutWithinDeadline(deadlineMs: number, fallbackMs: number): number {
  const remain = remainingMs(deadlineMs);
  if (remain <= 0) return 0;
  return Math.max(1, Math.min(fallbackMs, remain));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function feedbackIndexText(value: unknown): string | null {
  const asBig = asBigInt(value);
  if (asBig != null) return asBig.toString();
  const text = asText(value);
  if (!text) return null;
  return text;
}

async function loadKnownExecutionWalletsForChain(chainId: ChainId): Promise<Set<string>> {
  const [agentWalletRows, tbaWalletRows] = await Promise.all([
    db
      .select({ wallet: erc8004Agents.agentWallet })
      .from(erc8004Agents)
      .where(and(eq(erc8004Agents.chainId, chainId), isNotNull(erc8004Agents.agentWallet))),
    db
      .select({ wallet: erc6551Accounts.accountAddress })
      .from(erc6551Accounts)
      .where(eq(erc6551Accounts.chainId, chainId)),
  ]);

  const knownWallets = new Set<string>();
  for (const row of agentWalletRows) {
    if (row.wallet) knownWallets.add(row.wallet.toLowerCase());
  }
  for (const row of tbaWalletRows) {
    if (row.wallet) knownWallets.add(row.wallet.toLowerCase());
  }

  return knownWallets;
}

function safeSerialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(safeSerialize);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = safeSerialize(v);
    }
    return result;
  }
  return value;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`[timeout] ${label} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function getCursorBlock(scope: string): Promise<number | null> {
  const rows = await db
    .select({ cursorMeta: pipelineStageCursors.cursorMeta })
    .from(pipelineStageCursors)
    .where(and(eq(pipelineStageCursors.stage, STAGE_NAME), eq(pipelineStageCursors.scope, scope)))
    .limit(1);

  const meta = rows[0]?.cursorMeta as Record<string, unknown> | undefined;
  const raw = meta?.blockNumber;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function setCursorBlock(scope: string, blockNumber: number): Promise<void> {
  await db
    .insert(pipelineStageCursors)
    .values({
      stage: STAGE_NAME,
      scope,
      cursorTs: new Date(),
      cursorMeta: { blockNumber },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pipelineStageCursors.stage, pipelineStageCursors.scope],
      set: {
        cursorTs: new Date(),
        cursorMeta: { blockNumber },
        updatedAt: new Date(),
      },
    });
}

function computeRange(
  latestBlock: number,
  startBlock: number,
  cursorBlock: number | null,
  opts: { backfill?: boolean; maxBlocks: number }
): StreamRange | null {
  const fromBlock =
    cursorBlock == null
      ? opts.backfill
        ? startBlock
        : Math.max(startBlock, latestBlock - opts.maxBlocks + 1)
      : Math.max(startBlock, cursorBlock - REORG_WINDOW);

  if (fromBlock > latestBlock) return null;

  const toBlock = Math.min(latestBlock, fromBlock + opts.maxBlocks - 1);
  if (toBlock < fromBlock) return null;

  return { fromBlock, toBlock };
}

function chainConfigById(chainId: ChainId): ChainManifestEntry {
  const manifest = getOnchainManifest();
  const found = manifest.chains.find((c) => c.chainId === chainId);
  if (!found) {
    throw new Error(`Missing chain config for chainId=${chainId}`);
  }
  return found;
}

function normalizeUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

async function upsertManifestRows(): Promise<void> {
  const manifest = getOnchainManifest();

  for (const chain of manifest.chains) {
    await db
      .insert(onchainChains)
      .values({
        chainId: chain.chainId,
        name: chain.name,
        isTestnet: false,
        enabled: chain.enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [onchainChains.chainId],
        set: {
          name: chain.name,
          enabled: chain.enabled,
          updatedAt: new Date(),
        },
      });

    const candidates: Array<{ standard: string; role: string; address: string | null | undefined }> = [
      {
        standard: "erc8004",
        role: "identity_registry",
        address: chain.contracts.erc8004?.identityRegistry,
      },
      {
        standard: "erc8004",
        role: "reputation_registry",
        address: chain.contracts.erc8004?.reputationRegistry,
      },
      {
        standard: "erc8004",
        role: "validation_registry",
        address: chain.contracts.erc8004?.validationRegistry,
      },
      {
        standard: "erc6551",
        role: "registry",
        address: chain.contracts.erc6551Registry,
      },
    ];

    for (const entryPoint of chain.contracts.erc4337EntryPoints ?? []) {
      candidates.push({
        standard: "erc4337",
        role: "entrypoint",
        address: entryPoint,
      });
    }

    // Backward compatibility for older manifests that still use one entrypoint.
    if ((chain.contracts.erc4337EntryPoints ?? []).length === 0) {
      candidates.push({
        standard: "erc4337",
        role: "entrypoint",
        address: chain.contracts.erc4337EntryPoint,
      });
    }

    for (const coord of chain.contracts.erc8001Contracts ?? []) {
      candidates.push({ standard: "erc8001", role: "coordination", address: coord });
    }
    for (const c of chain.contracts.erc7007Contracts ?? []) {
      candidates.push({ standard: "erc7007", role: "token", address: c });
    }
    for (const c of chain.contracts.erc7579Accounts ?? []) {
      candidates.push({ standard: "erc7579", role: "module_config", address: c });
    }

    for (const candidate of candidates) {
      const address = normalizeAddress(candidate.address);
      if (!address) continue;

      await db
        .insert(onchainContracts)
        .values({
          chainId: chain.chainId,
          standard: candidate.standard,
          role: candidate.role,
          address,
          startBlock: chain.startBlock,
          enabled: chain.enabled,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [onchainContracts.chainId, onchainContracts.address, onchainContracts.role],
          set: {
            standard: candidate.standard,
            startBlock: chain.startBlock,
            enabled: chain.enabled,
            updatedAt: new Date(),
          },
        });
    }
  }
}

async function upsertAgentMetadata(agentKey: string, uri: string): Promise<void> {
  const normalized = normalizeUri(uri);
  const parsed = await parseAgentMetadataFromUri(normalized);

  await db
    .insert(erc8004AgentMetadata)
    .values({
      agentKey,
      name: parsed.name,
      description: parsed.description,
      protocols: parsed.protocols,
      x402Supported: parsed.x402Supported,
      serviceEndpointsJson: parsed.serviceEndpointsJson,
      crossChainJson: parsed.crossChainJson,
      parseStatus: parsed.parseStatus,
      fieldSources: parsed.fieldSources,
      lastParsedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [erc8004AgentMetadata.agentKey],
      set: {
        name: parsed.name,
        description: parsed.description,
        protocols: parsed.protocols,
        x402Supported: parsed.x402Supported,
        serviceEndpointsJson: parsed.serviceEndpointsJson,
        crossChainJson: parsed.crossChainJson,
        parseStatus: parsed.parseStatus,
        fieldSources: parsed.fieldSources,
        lastParsedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function ensureAgentAnchorRow(input: {
  agentKey: string;
  chainId: ChainId;
  registryAddress: string;
  agentId: string;
  txHash: string;
  blockNumber: number;
}): Promise<void> {
  await db
    .insert(erc8004Agents)
    .values({
      agentKey: input.agentKey,
      chainId: input.chainId,
      registryAddress: input.registryAddress,
      agentId: input.agentId,
      updatedTxHash: input.txHash,
      lastEventBlock: input.blockNumber,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [erc8004Agents.agentKey],
      set: {
        updatedTxHash: input.txHash,
        lastEventBlock: input.blockNumber,
        updatedAt: new Date(),
      },
    });
}

async function ensureFeedbackAnchorRow(input: {
  feedbackKey: string;
  agentKey: string;
  clientAddress: string;
  feedbackIndex: string;
  txHash: string;
}): Promise<void> {
  await db
    .insert(erc8004Feedbacks)
    .values({
      feedbackKey: input.feedbackKey,
      agentKey: input.agentKey,
      clientAddress: input.clientAddress,
      feedbackIndex: input.feedbackIndex,
      createdTxHash: input.txHash,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [erc8004Feedbacks.feedbackKey],
      set: {
        updatedAt: new Date(),
      },
    });
}

async function insertCanonicalLog(input: {
  stream: ContractStream;
  log: any;
  blockTime: Date;
}): Promise<void> {
  await db
    .insert(onchainEventLogs)
    .values({
      chainId: input.stream.chainId,
      standard: input.stream.standard,
      contractAddress: input.stream.address,
      blockNumber: asNum(input.log.blockNumber),
      blockTime: input.blockTime,
      txHash: asText(input.log.transactionHash) ?? "",
      logIndex: asNum(input.log.logIndex),
      eventName: input.stream.eventName,
      eventSig: Array.isArray(input.log.topics) ? asText(input.log.topics[0]) : null,
      decodedJson: safeSerialize(input.log.args) as Record<string, unknown>,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [onchainEventLogs.chainId, onchainEventLogs.txHash, onchainEventLogs.logIndex],
    });
}

async function insertDeadLetter(input: {
  scope: string;
  stream: ContractStream;
  log: any;
  error: unknown;
}): Promise<void> {
  const txHash = asText(input.log?.transactionHash) ?? "";
  const logIndex = asNum(input.log?.logIndex);
  if (!txHash) return;

  await db
    .insert(onchainIngestDeadLetters)
    .values({
      scope: input.scope,
      chainId: input.stream.chainId,
      standard: input.stream.standard,
      contractAddress: input.stream.address,
      blockNumber: asNum(input.log?.blockNumber),
      txHash,
      logIndex,
      eventName: input.stream.eventName,
      error: clampErrorMessage(input.error),
      payloadJson: safeSerializeForStorage(input.log?.args),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        onchainIngestDeadLetters.scope,
        onchainIngestDeadLetters.chainId,
        onchainIngestDeadLetters.txHash,
        onchainIngestDeadLetters.logIndex,
      ],
      set: {
        error: clampErrorMessage(input.error),
        payloadJson: safeSerializeForStorage(input.log?.args),
        lastSeenAt: new Date(),
      },
    });
}

async function insertEip7702DeadLetter(input: {
  scope: string;
  chainId: ChainId;
  blockNumber: number;
  txHash: string;
  error: unknown;
  tx: unknown;
}): Promise<void> {
  if (!input.txHash) return;

  await db
    .insert(onchainIngestDeadLetters)
    .values({
      scope: input.scope,
      chainId: input.chainId,
      standard: "eip7702",
      contractAddress: "eip7702",
      blockNumber: input.blockNumber,
      txHash: input.txHash,
      logIndex: 0,
      eventName: "authorization",
      error: clampErrorMessage(input.error),
      payloadJson: safeSerializeForStorage(input.tx),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        onchainIngestDeadLetters.scope,
        onchainIngestDeadLetters.chainId,
        onchainIngestDeadLetters.txHash,
        onchainIngestDeadLetters.logIndex,
      ],
      set: {
        error: clampErrorMessage(input.error),
        payloadJson: safeSerializeForStorage(input.tx),
        lastSeenAt: new Date(),
      },
    });
}

async function processStreamEvent(input: {
  stream: ContractStream;
  log: any;
  blockTime: Date;
}): Promise<void> {
  const { stream, log } = input;
  const args = (log.args ?? {}) as Record<string, unknown>;
  const txHash = asText(log.transactionHash) ?? "";
  const blockNumber = asNum(log.blockNumber);

  if (stream.standard === "erc8004" && stream.role === "identity_registry") {
    const agentIdRaw = args.agentId as bigint | number | string | undefined;
    if (agentIdRaw == null) return;
    const agentKey = makeAgentKey(stream.chainId, stream.address, agentIdRaw);

    if (stream.eventName === "Registered") {
      const owner = normalizeAddress(args.owner);
      const agentUri = asText(args.agentURI);
      await db
        .insert(erc8004Agents)
        .values({
          agentKey,
          chainId: stream.chainId,
          registryAddress: stream.address,
          agentId: String(agentIdRaw),
          ownerAddress: owner,
          agentUri,
          registeredTxHash: txHash,
          updatedTxHash: txHash,
          lastEventBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Agents.agentKey],
          set: {
            ownerAddress: owner,
            agentUri,
            registeredTxHash: txHash,
            updatedTxHash: txHash,
            lastEventBlock: blockNumber,
            updatedAt: new Date(),
          },
        });

      if (agentUri) {
        await upsertAgentMetadata(agentKey, agentUri);
      }
      return;
    }

    if (stream.eventName === "URIUpdated") {
      const newUri = asText(args.newURI);
      await db
        .insert(erc8004Agents)
        .values({
          agentKey,
          chainId: stream.chainId,
          registryAddress: stream.address,
          agentId: String(agentIdRaw),
          agentUri: newUri,
          updatedTxHash: txHash,
          lastEventBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Agents.agentKey],
          set: {
            agentUri: newUri,
            updatedTxHash: txHash,
            lastEventBlock: blockNumber,
            updatedAt: new Date(),
          },
        });

      if (newUri) {
        await upsertAgentMetadata(agentKey, newUri);
      }
      return;
    }

    if (stream.eventName === "AgentWalletSet") {
      const wallet = normalizeAddress(args.newWallet);
      await db
        .insert(erc8004Agents)
        .values({
          agentKey,
          chainId: stream.chainId,
          registryAddress: stream.address,
          agentId: String(agentIdRaw),
          agentWallet: wallet,
          updatedTxHash: txHash,
          lastEventBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Agents.agentKey],
          set: {
            agentWallet: wallet,
            updatedTxHash: txHash,
            lastEventBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    await db
      .insert(erc8004Agents)
      .values({
        agentKey,
        chainId: stream.chainId,
        registryAddress: stream.address,
        agentId: String(agentIdRaw),
        updatedTxHash: txHash,
        lastEventBlock: blockNumber,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [erc8004Agents.agentKey],
        set: {
          updatedTxHash: txHash,
          lastEventBlock: blockNumber,
          updatedAt: new Date(),
        },
      });
    return;
  }

  if (stream.standard === "erc8004" && stream.role === "reputation_registry") {
    const agentIdRaw = args.agentId as bigint | number | string | undefined;
    if (agentIdRaw == null) return;
    const identityRegistry = stream.identityRegistryAddress ?? stream.address;
    const agentKey = makeAgentKey(stream.chainId, identityRegistry, agentIdRaw);
    await ensureAgentAnchorRow({
      agentKey,
      chainId: stream.chainId,
      registryAddress: identityRegistry,
      agentId: String(agentIdRaw),
      txHash,
      blockNumber,
    });

    if (stream.eventName === "NewFeedback") {
      const client = normalizeAddress(args.clientAddress) ?? "";
      const feedbackIndex = feedbackIndexText(args.feedbackIndex);
      if (!feedbackIndex) return;
      const feedbackKey = `${agentKey}:${client}:${feedbackIndex}`;

      await db
        .insert(erc8004Feedbacks)
        .values({
          feedbackKey,
          agentKey,
          clientAddress: client,
          feedbackIndex,
          valueNumeric: asText(args.value),
          valueDecimals: asNum(args.valueDecimals as bigint | number),
          tag1: asText(args.tag1),
          tag2: asText(args.tag2),
          endpoint: asText(args.endpoint),
          feedbackUri: asText(args.feedbackURI),
          feedbackHash: asText(args.feedbackHash),
          createdTxHash: txHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Feedbacks.feedbackKey],
          set: {
            valueNumeric: asText(args.value),
            valueDecimals: asNum(args.valueDecimals as bigint | number),
            tag1: asText(args.tag1),
            tag2: asText(args.tag2),
            endpoint: asText(args.endpoint),
            feedbackUri: asText(args.feedbackURI),
            feedbackHash: asText(args.feedbackHash),
            createdTxHash: txHash,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "FeedbackRevoked") {
      const client = normalizeAddress(args.clientAddress) ?? "";
      const feedbackIndex = feedbackIndexText(args.feedbackIndex);
      if (!feedbackIndex) return;
      const feedbackKey = `${agentKey}:${client}:${feedbackIndex}`;

      await db
        .insert(erc8004Feedbacks)
        .values({
          feedbackKey,
          agentKey,
          clientAddress: client,
          feedbackIndex,
          isRevoked: true,
          revokedTxHash: txHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Feedbacks.feedbackKey],
          set: {
            isRevoked: true,
            revokedTxHash: txHash,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "ResponseAppended") {
      const client = normalizeAddress(args.clientAddress) ?? "";
      const feedbackIndex = feedbackIndexText(args.feedbackIndex);
      if (!feedbackIndex) return;
      const feedbackKey = `${agentKey}:${client}:${feedbackIndex}`;
      await ensureFeedbackAnchorRow({
        feedbackKey,
        agentKey,
        clientAddress: client,
        feedbackIndex,
        txHash,
      });

      await db
        .insert(erc8004FeedbackResponses)
        .values({
          feedbackKey,
          responder: normalizeAddress(args.responder) ?? "",
          responseUri: asText(args.responseURI),
          responseHash: asText(args.responseHash),
          txHash,
          logIndex: asNum(log.logIndex),
        })
        .onConflictDoNothing({
          target: [erc8004FeedbackResponses.txHash, erc8004FeedbackResponses.logIndex],
        });
    }

    return;
  }

  if (stream.standard === "erc8004" && stream.role === "validation_registry") {
    const agentIdRaw = args.agentId as bigint | number | string | undefined;
    const requestHash = asText(args.requestHash);
    if (!requestHash) return;

    const identityRegistry = stream.identityRegistryAddress ?? stream.address;
    const agentKey =
      agentIdRaw == null ? null : makeAgentKey(stream.chainId, identityRegistry, agentIdRaw);
    if (agentKey && agentIdRaw != null) {
      await ensureAgentAnchorRow({
        agentKey,
        chainId: stream.chainId,
        registryAddress: identityRegistry,
        agentId: String(agentIdRaw),
        txHash,
        blockNumber,
      });
    }

    if (stream.eventName === "ValidationRequest") {
      await db
        .insert(erc8004Validations)
        .values({
          requestHash,
          agentKey,
          validatorAddress: normalizeAddress(args.validatorAddress),
          requestUri: asText(args.requestURI),
          status: "requested",
          requestedTxHash: txHash,
          lastUpdatedBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Validations.requestHash],
          set: {
            agentKey,
            validatorAddress: normalizeAddress(args.validatorAddress),
            requestUri: asText(args.requestURI),
            status: "requested",
            requestedTxHash: txHash,
            lastUpdatedBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "ValidationResponse") {
      await db
        .insert(erc8004Validations)
        .values({
          requestHash,
          agentKey,
          validatorAddress: normalizeAddress(args.validatorAddress),
          responseScore: asNum(args.response as bigint | number),
          responseUri: asText(args.responseURI),
          responseHash: asText(args.responseHash),
          tag: asText(args.tag),
          status: "responded",
          respondedTxHash: txHash,
          lastUpdatedBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8004Validations.requestHash],
          set: {
            responseScore: asNum(args.response as bigint | number),
            responseUri: asText(args.responseURI),
            responseHash: asText(args.responseHash),
            tag: asText(args.tag),
            status: "responded",
            respondedTxHash: txHash,
            lastUpdatedBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
    }

    return;
  }

  if (stream.standard === "erc6551" && stream.eventName === "ERC6551AccountCreated") {
    const account = normalizeAddress(args.account);
    const tokenContract = normalizeAddress(args.tokenContract);
    const tokenId = asText(args.tokenId);
    if (!account || !tokenContract || !tokenId) return;

    const accountKey = `${stream.chainId}:${tokenContract}:${tokenId}:${account}`;

    await db
      .insert(erc6551Accounts)
      .values({
        accountKey,
        chainId: stream.chainId,
        registryAddress: stream.address,
        accountAddress: account,
        tokenContract,
        tokenId,
        salt: asText(args.salt),
        implementation: normalizeAddress(args.implementation),
        createdTxHash: txHash,
      })
      .onConflictDoUpdate({
        target: [erc6551Accounts.accountKey],
        set: {
          implementation: normalizeAddress(args.implementation),
          createdTxHash: txHash,
        },
      });

    const agentKey = `${stream.chainId}:${tokenContract}:${tokenId}`;
    await db
      .insert(erc8004Agents)
      .values({
        agentKey,
        chainId: stream.chainId,
        registryAddress: tokenContract,
        agentId: tokenId,
        agentWallet: account,
        updatedTxHash: txHash,
        lastEventBlock: blockNumber,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [erc8004Agents.agentKey],
        set: {
          agentWallet: account,
          updatedTxHash: txHash,
          lastEventBlock: blockNumber,
          updatedAt: new Date(),
        },
      });

    return;
  }

  if (stream.standard === "erc4337") {
    const userOpHash = asText(args.userOpHash);
    if (!userOpHash) return;

    await db
      .insert(erc4337UserOps)
      .values({
        userOpHash,
        chainId: stream.chainId,
        entryPoint: stream.address,
        sender: normalizeAddress(args.sender),
        paymaster: normalizeAddress(args.paymaster),
        nonce: asText(args.nonce),
        success:
          typeof args.success === "boolean"
            ? args.success
            : stream.eventName === "AccountDeployed"
              ? true
              : null,
        actualGasCost: asText(args.actualGasCost),
        actualGasUsed: asText(args.actualGasUsed),
        txHash,
        blockNumber,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [erc4337UserOps.userOpHash],
        set: {
          sender: normalizeAddress(args.sender),
          paymaster: normalizeAddress(args.paymaster),
          nonce: asText(args.nonce),
          success:
            typeof args.success === "boolean"
              ? args.success
              : stream.eventName === "AccountDeployed"
                ? true
                : null,
          actualGasCost: asText(args.actualGasCost),
          actualGasUsed: asText(args.actualGasUsed),
          txHash,
          blockNumber,
          updatedAt: new Date(),
        },
      });

    return;
  }

  if (stream.standard === "erc8001") {
    const intentHash = asText(args.intentHash);
    if (!intentHash) return;

    if (stream.eventName === "CoordinationProposed") {
      await db
        .insert(erc8001Coordinations)
        .values({
          intentHash,
          chainId: stream.chainId,
          contractAddress: stream.address,
          coordinationType: asText(args.coordinationType),
          proposer: normalizeAddress(args.proposer),
          status: "proposed",
          participantCount: asNum(args.participantCount as bigint | number),
          coordinationValue: asText(args.coordinationValue),
          lastTxHash: txHash,
          lastBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8001Coordinations.intentHash],
          set: {
            coordinationType: asText(args.coordinationType),
            proposer: normalizeAddress(args.proposer),
            status: "proposed",
            participantCount: asNum(args.participantCount as bigint | number),
            coordinationValue: asText(args.coordinationValue),
            lastTxHash: txHash,
            lastBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "CoordinationAccepted") {
      await db
        .insert(erc8001Coordinations)
        .values({
          intentHash,
          chainId: stream.chainId,
          contractAddress: stream.address,
          status: "accepted",
          acceptedCount: asNum(args.acceptedCount as bigint | number),
          lastTxHash: txHash,
          lastBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8001Coordinations.intentHash],
          set: {
            status: "accepted",
            acceptedCount: asNum(args.acceptedCount as bigint | number),
            lastTxHash: txHash,
            lastBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "CoordinationExecuted") {
      await db
        .insert(erc8001Coordinations)
        .values({
          intentHash,
          chainId: stream.chainId,
          contractAddress: stream.address,
          executor: normalizeAddress(args.executor),
          status: "executed",
          lastTxHash: txHash,
          lastBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8001Coordinations.intentHash],
          set: {
            executor: normalizeAddress(args.executor),
            status: "executed",
            lastTxHash: txHash,
            lastBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (stream.eventName === "CoordinationCancelled") {
      await db
        .insert(erc8001Coordinations)
        .values({
          intentHash,
          chainId: stream.chainId,
          contractAddress: stream.address,
          status: "cancelled",
          lastTxHash: txHash,
          lastBlock: blockNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [erc8001Coordinations.intentHash],
          set: {
            status: "cancelled",
            lastTxHash: txHash,
            lastBlock: blockNumber,
            updatedAt: new Date(),
          },
        });
      return;
    }

    return;
  }

  if (stream.standard === "erc7007" && stream.eventName === "AigcData") {
    await db
      .insert(erc7007AigcEvents)
      .values({
        chainId: stream.chainId,
        contractAddress: stream.address,
        tokenId: asText(args.tokenId) ?? "",
        promptBytes: asText(args.prompt),
        aigcDataBytes: asText(args.aigcData),
        proofBytes: asText(args.proof),
        txHash,
        logIndex: asNum(log.logIndex),
      })
      .onConflictDoNothing({
        target: [erc7007AigcEvents.chainId, erc7007AigcEvents.txHash, erc7007AigcEvents.logIndex],
      });
    return;
  }

  if (stream.standard === "erc7579") {
    const eventType = stream.eventName === "ModuleInstalled" ? "installed" : "uninstalled";

    await db
      .insert(erc7579ModuleEvents)
      .values({
        chainId: stream.chainId,
        accountAddress: stream.address,
        moduleTypeId: asText(args.moduleTypeId),
        moduleAddress: normalizeAddress(args.moduleAddress ?? args.module),
        eventType,
        txHash,
        logIndex: asNum(log.logIndex),
      })
      .onConflictDoNothing({
        target: [
          erc7579ModuleEvents.chainId,
          erc7579ModuleEvents.txHash,
          erc7579ModuleEvents.logIndex,
        ],
      });
  }
}

async function deriveAgentKeysForEvent(input: {
  stream: ContractStream;
  log: any;
}): Promise<string[]> {
  const args = (input.log.args ?? {}) as Record<string, unknown>;
  const keys = new Set<string>();

  if (input.stream.standard === "erc8004") {
    const agentIdRaw = args.agentId as bigint | number | string | undefined;
    if (agentIdRaw != null) {
      const registryAddress =
        input.stream.role === "identity_registry"
          ? input.stream.address
          : input.stream.identityRegistryAddress ?? input.stream.address;
      keys.add(makeAgentKey(input.stream.chainId, registryAddress, agentIdRaw));
    }
  }

  if (input.stream.standard === "erc6551" && input.stream.eventName === "ERC6551AccountCreated") {
    const tokenContract = normalizeAddress(args.tokenContract);
    const tokenId = asText(args.tokenId);
    if (tokenContract && tokenId) {
      keys.add(`${input.stream.chainId}:${tokenContract}:${tokenId}`);
    }
  }

  if (input.stream.standard === "erc4337") {
    const sender = normalizeAddress(args.sender);
    if (sender) {
      const rows = await db
        .select({ agentKey: erc8004Agents.agentKey })
        .from(erc8004Agents)
        .where(
          and(
            eq(erc8004Agents.chainId, input.stream.chainId),
            eq(erc8004Agents.agentWallet, sender)
          )
        )
        .limit(2);
      for (const row of rows) {
        if (row.agentKey) keys.add(row.agentKey);
      }
    }
  }

  return Array.from(keys);
}

async function fetchBlockTime(
  client: any,
  blockNumber: bigint,
  cache: Map<string, Date>,
  deadlineMs: number,
  scope: string
): Promise<Date> {
  const key = blockNumber.toString();
  if (cache.has(key)) return cache.get(key)!;
  const timeoutMs = timeoutWithinDeadline(deadlineMs, RPC_CALL_TIMEOUT_MS);
  if (timeoutMs <= 0) {
    throw new Error(`[run_budget] no remaining time for ${scope}:getBlock:${key}`);
  }
  const block = (await withTimeout(
    client.getBlock({ blockNumber }),
    timeoutMs,
    `${scope}:getBlock:${key}`
  )) as any;
  const date = toDateFromUnix(block.timestamp);
  cache.set(key, date);
  return date;
}

async function fetchErc4337LogsForKnownWallets(input: {
  client: any;
  stream: ContractStream;
  range: StreamRange;
  knownWallets: Set<string>;
  deadlineMs: number;
}): Promise<{ logs: any[]; errors: string[] }> {
  const knownSenders = Array.from(input.knownWallets);
  if (knownSenders.length === 0) {
    return { logs: [], errors: [] };
  }

  const event = parseEventAbi(input.stream.eventAbi);
  const senderChunks = chunkArray(knownSenders, ERC4337_SENDER_CHUNK_SIZE);
  const logs: any[] = [];
  const errors: string[] = [];
  const scope = streamScope(input.stream);

  for (const senderChunk of senderChunks) {
    const timeoutMs = timeoutWithinDeadline(input.deadlineMs, RPC_CALL_TIMEOUT_MS);
    if (timeoutMs <= LOG_LOOP_GUARD_MS) {
      errors.push(`[run_budget] insufficient time before ${scope}:getLogs(sender-filtered)`);
      break;
    }

    try {
      const senderArg = senderChunk.length === 1 ? senderChunk[0] : senderChunk;
      const chunkLogs = (await withTimeout(
        input.client.getLogs({
          address: input.stream.address,
          event,
          args: { sender: senderArg },
          fromBlock: BigInt(input.range.fromBlock),
          toBlock: BigInt(input.range.toBlock),
          strict: false,
        }),
        timeoutMs,
        `${scope}:getLogs(sender-filtered,chunk=${senderChunk.length})`
      )) as any[];
      logs.push(...chunkLogs);
    } catch (error) {
      errors.push(clampErrorMessage(error));
    }
  }

  logs.sort((a, b) => {
    const blockA = asNum(a?.blockNumber);
    const blockB = asNum(b?.blockNumber);
    if (blockA !== blockB) return blockA - blockB;
    return asNum(a?.logIndex) - asNum(b?.logIndex);
  });

  return { logs, errors };
}

async function ingestStream(
  stream: ContractStream,
  opts: { backfill?: boolean },
  knownWalletsCache: Map<ChainId, Set<string>>,
  deadlineMs: number,
  llmBudget: OnchainTopicLlmBudget
): Promise<IngestStreamResult> {
  const chainConfig = chainConfigById(stream.chainId);
  const client = getPublicClient(stream.chainId, buildRpcUrlList(stream.chainId, chainConfig.rpcUrls));
  const scope = streamScope(stream);
  const blockNumberTimeout = timeoutWithinDeadline(deadlineMs, RPC_CALL_TIMEOUT_MS);
  if (blockNumberTimeout <= 0) {
    return {
      scope,
      chainId: stream.chainId,
      standard: stream.standard,
      eventName: stream.eventName,
      logsFetched: 0,
      logsPersisted: 0,
      logsSkippedByAgentFilter: 0,
      logsFailed: 0,
      fromBlock: null,
      toBlock: null,
      errors: [`[run_budget] no remaining time before ${scope}:getBlockNumber`],
    };
  }
  const latestBlock = asNum(
    await withTimeout(client.getBlockNumber(), blockNumberTimeout, `${scope}:getBlockNumber`)
  );
  const cursorBlock = await getCursorBlock(scope);
  const range = computeRange(latestBlock, asNum(stream.startBlock), cursorBlock, {
    backfill: opts.backfill,
    maxBlocks: MAX_BLOCKS_PER_STREAM,
  });

  if (!range) {
    return {
      scope,
      chainId: stream.chainId,
      standard: stream.standard,
      eventName: stream.eventName,
      logsFetched: 0,
      logsPersisted: 0,
      logsSkippedByAgentFilter: 0,
      logsFailed: 0,
      fromBlock: null,
      toBlock: null,
      errors: [],
    };
  }

  let knownWallets: Set<string> | null = null;
  let logs: any[] = [];
  const streamErrors: string[] = [];

  if (stream.standard === "erc4337") {
    knownWallets = knownWalletsCache.get(stream.chainId) ?? null;
    if (!knownWallets) {
      knownWallets = await loadKnownExecutionWalletsForChain(stream.chainId);
      knownWalletsCache.set(stream.chainId, knownWallets);
    }

    if (knownWallets.size === 0) {
      await setCursorBlock(scope, range.toBlock);
      return {
        scope,
        chainId: stream.chainId,
        standard: stream.standard,
        eventName: stream.eventName,
        logsFetched: 0,
        logsPersisted: 0,
        logsSkippedByAgentFilter: 0,
        logsFailed: 0,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        errors: [],
      };
    }

    const filtered = await fetchErc4337LogsForKnownWallets({
      client,
      stream,
      range,
      knownWallets,
      deadlineMs,
    });
    logs = filtered.logs;
    streamErrors.push(...filtered.errors.slice(0, ERROR_MAX_ITEMS_PER_STREAM));
  } else {
    const logsTimeout = timeoutWithinDeadline(deadlineMs, RPC_CALL_TIMEOUT_MS);
    if (logsTimeout <= 0) {
      return {
        scope,
        chainId: stream.chainId,
        standard: stream.standard,
        eventName: stream.eventName,
        logsFetched: 0,
        logsPersisted: 0,
        logsSkippedByAgentFilter: 0,
        logsFailed: 0,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        errors: [`[run_budget] no remaining time before ${scope}:getLogs`],
      };
    }

    const event = parseEventAbi(stream.eventAbi);
    logs = (await withTimeout(
      client.getLogs({
        address: stream.address,
        event,
        fromBlock: BigInt(range.fromBlock),
        toBlock: BigInt(range.toBlock),
        strict: false,
      }),
      logsTimeout,
      `${scope}:getLogs`
    )) as any[];
  }

  let logsPersisted = 0;
  let logsSkippedByAgentFilter = 0;
  let logsFailed = 0;
  let lastProcessedBlock: number | null = null;
  let exhaustedBudget = false;
  const blockTimeCache = new Map<string, Date>();
  for (const log of logs as any[]) {
    if (remainingMs(deadlineMs) <= LOG_LOOP_GUARD_MS) {
      exhaustedBudget = true;
      streamErrors.push(`[run_budget] stopping ${scope} loop early`);
      break;
    }

    if (stream.standard === "erc4337" && knownWallets) {
      const args = ((log as any).args ?? {}) as Record<string, unknown>;
      if (!shouldPersist4337Log(args, knownWallets)) {
        logsSkippedByAgentFilter += 1;
        continue;
      }
    }

    try {
      const blockTime = await fetchBlockTime(client, log.blockNumber, blockTimeCache, deadlineMs, scope);
      await insertCanonicalLog({ stream, log, blockTime });
      await processStreamEvent({ stream, log, blockTime });
      const agentKeys = await deriveAgentKeysForEvent({ stream, log });
      await upsertOnchainEventEnrichment({
        stream,
        eventName: stream.eventName,
        chainId: stream.chainId,
        txHash: asText(log.transactionHash) ?? "",
        logIndex: asNum(log.logIndex),
        blockTime,
        args: ((log.args ?? {}) as Record<string, unknown>),
        agentKeys,
        llmBudget,
      });
      logsPersisted += 1;
      lastProcessedBlock = asNum(log.blockNumber);
    } catch (error) {
      logsFailed += 1;
      const compactError = clampErrorMessage(error);
      if (streamErrors.length < ERROR_MAX_ITEMS_PER_STREAM) {
        streamErrors.push(`[log_failed] ${compactError}`);
      }
      try {
        await insertDeadLetter({ scope, stream, log, error });
      } catch (deadLetterError) {
        if (streamErrors.length < ERROR_MAX_ITEMS_PER_STREAM) {
          streamErrors.push(`[dead_letter_failed] ${clampErrorMessage(deadLetterError)}`);
        }
      }
      continue;
    }
  }

  if (exhaustedBudget) {
    if (lastProcessedBlock != null) {
      await setCursorBlock(scope, lastProcessedBlock);
    }
  } else {
    await setCursorBlock(scope, range.toBlock);
  }

  return {
    scope,
    chainId: stream.chainId,
    standard: stream.standard,
    eventName: stream.eventName,
    logsFetched: logs.length,
    logsPersisted,
    logsSkippedByAgentFilter,
    logsFailed,
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
    errors: streamErrors,
  };
}

function txTypeIsEip7702(type: unknown): boolean {
  if (typeof type === "number") return type === 4;
  if (typeof type === "string") {
    const normalized = type.toLowerCase();
    return normalized === "0x4" || normalized === "4" || normalized === "eip7702";
  }
  return false;
}

async function ingestEip7702ForChain(
  chain: ChainManifestEntry,
  opts: { backfill?: boolean },
  deadlineMs: number
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const client = getPublicClient(chain.chainId, buildRpcUrlList(chain.chainId, chain.rpcUrls));
  const blockNumberTimeout = timeoutWithinDeadline(deadlineMs, RPC_CALL_TIMEOUT_MS);
  if (blockNumberTimeout <= 0) {
    return {
      processed: 0,
      failed: 0,
      errors: [`[run_budget] no remaining time before chain:${chain.chainId}:eip7702:getBlockNumber`],
    };
  }
  const latestBlock = asNum(
    await withTimeout(
      client.getBlockNumber(),
      blockNumberTimeout,
      `chain:${chain.chainId}:eip7702:getBlockNumber`
    )
  );
  const scope = `chain:${chain.chainId}:eip7702`;
  const cursorBlock = await getCursorBlock(scope);
  const range = computeRange(latestBlock, chain.startBlock, cursorBlock, {
    backfill: opts.backfill,
    maxBlocks: MAX_BLOCKS_EIP7702,
  });

  if (!range) {
    return { processed: 0, failed: 0, errors: [] };
  }

  const [agentWalletRows, tbaWalletRows] = await Promise.all([
    db
      .select({ wallet: erc8004Agents.agentWallet })
      .from(erc8004Agents)
      .where(and(eq(erc8004Agents.chainId, chain.chainId), isNotNull(erc8004Agents.agentWallet))),
    db
      .select({ wallet: erc6551Accounts.accountAddress })
      .from(erc6551Accounts)
      .where(eq(erc6551Accounts.chainId, chain.chainId)),
  ]);

  const knownWallets = new Set<string>();
  for (const row of agentWalletRows) {
    if (row.wallet) knownWallets.add(row.wallet.toLowerCase());
  }
  for (const row of tbaWalletRows) {
    if (row.wallet) knownWallets.add(row.wallet.toLowerCase());
  }

  if (knownWallets.size === 0) {
    await setCursorBlock(scope, range.toBlock);
    return { processed: 0, failed: 0, errors: [] };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  let lastProcessedBlock: number | null = null;
  for (let blockNumber = range.fromBlock; blockNumber <= range.toBlock; blockNumber++) {
    if (remainingMs(deadlineMs) <= LOG_LOOP_GUARD_MS) {
      errors.push(`[run_budget] stopping chain:${chain.chainId}:eip7702 loop early`);
      break;
    }

    const getBlockTimeout = timeoutWithinDeadline(deadlineMs, RPC_CALL_TIMEOUT_MS);
    if (getBlockTimeout <= 0) {
      errors.push(`[run_budget] no remaining time for chain:${chain.chainId}:eip7702:getBlock`);
      break;
    }
    const block = (await withTimeout(
      client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: true,
      }),
      getBlockTimeout,
      `chain:${chain.chainId}:eip7702:getBlock:${blockNumber}`
    )) as any;

    for (const [txIndex, tx] of (block.transactions as any[]).entries()) {
      if (!tx || typeof tx === "string") continue;
      if (!txTypeIsEip7702(tx.type)) continue;

      const from = normalizeAddress(tx.from);
      if (!from || !knownWallets.has(from)) continue;
      const txHash = asText(tx.hash) ?? `unknown:${chain.chainId}:${blockNumber}:${txIndex}`;

      const authorizationList = Array.isArray(tx.authorizationList)
        ? (safeSerialize(tx.authorizationList) as Record<string, unknown>[])
        : [];
      try {
        await db
          .insert(eip7702Authorizations)
          .values({
            chainId: chain.chainId,
            txHash,
            blockNumber,
            senderEoa: from,
            authorizationCount: authorizationList.length,
            authorizationJson: authorizationList,
          })
          .onConflictDoUpdate({
            target: [eip7702Authorizations.chainId, eip7702Authorizations.txHash],
            set: {
              blockNumber,
              senderEoa: from,
              authorizationCount: authorizationList.length,
              authorizationJson: authorizationList,
            },
          });

        processed++;
      } catch (error) {
        failed++;
        if (errors.length < ERROR_MAX_ITEMS_PER_STREAM) {
          errors.push(`[tx_failed] ${clampErrorMessage(error)}`);
        }
        try {
          await insertEip7702DeadLetter({
            scope,
            chainId: chain.chainId,
            blockNumber,
            txHash,
            error,
            tx,
          });
        } catch (deadLetterError) {
          if (errors.length < ERROR_MAX_ITEMS_PER_STREAM) {
            errors.push(`[dead_letter_failed] ${clampErrorMessage(deadLetterError)}`);
          }
        }
      }
    }

    lastProcessedBlock = blockNumber;
  }

  if (lastProcessedBlock != null && lastProcessedBlock < range.toBlock) {
    await setCursorBlock(scope, lastProcessedBlock);
  } else {
    await setCursorBlock(scope, range.toBlock);
  }
  return { processed, failed, errors };
}

export async function runOnchainIngestion(opts?: {
  backfill?: boolean;
}): Promise<OnchainIngestResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  const streamStats: OnchainIngestResult["streamStats"] = [];
  let streamsProcessed = 0;
  let eventsIngested = 0;
  const knownWalletsCache = new Map<ChainId, Set<string>>();
  const llmBudget = buildOnchainTopicLlmBudget();
  const runDeadlineMs = Date.now() + RUN_BUDGET_MS;

  await upsertManifestRows();

  const manifest = getOnchainManifest();
  const streams = buildContractStreams(manifest).filter((stream) => stream.enabled);

  for (const stream of streams) {
    const remain = remainingMs(runDeadlineMs);
    if (remain <= STREAM_MIN_REMAINING_MS) {
      errors.push(
        `[run_budget] reached ${RUN_BUDGET_MS}ms before stream ${streamScope(stream)}; continue next cron run`
      );
      break;
    }

    try {
      const streamTimeoutMs = Math.max(1, Math.min(STREAM_PROCESS_TIMEOUT_MS, remain - 200));
      const result = await withTimeout(
        ingestStream(stream, opts ?? {}, knownWalletsCache, runDeadlineMs, llmBudget),
        streamTimeoutMs,
        `stream:${streamScope(stream)}`
      );
      streamsProcessed += 1;
      eventsIngested += result.logsPersisted;
      streamStats.push({
        scope: result.scope,
        chainId: result.chainId,
        standard: result.standard,
        eventName: result.eventName,
        logsFetched: result.logsFetched,
        logsPersisted: result.logsPersisted,
        logsSkippedByAgentFilter: result.logsSkippedByAgentFilter,
        logsFailed: result.logsFailed,
        fromBlock: result.fromBlock,
        toBlock: result.toBlock,
      });
      errors.push(...result.errors);
    } catch (error: any) {
      errors.push(
        `[${stream.chainId}:${stream.standard}:${stream.eventName}] ${clampErrorMessage(error)}`
      );
    }
  }

  for (const chain of manifest.chains.filter((chain) => chain.enabled)) {
    const remain = remainingMs(runDeadlineMs);
    if (remain <= STREAM_MIN_REMAINING_MS) {
      errors.push(
        `[run_budget] reached ${RUN_BUDGET_MS}ms before eip7702 chain ${chain.chainId}; continue next cron run`
      );
      break;
    }

    const scope = `chain:${chain.chainId}:eip7702`;
    try {
      const streamTimeoutMs = Math.max(1, Math.min(STREAM_PROCESS_TIMEOUT_MS, remain - 200));
      const result = await withTimeout(
        ingestEip7702ForChain(chain, opts ?? {}, runDeadlineMs),
        streamTimeoutMs,
        `stream:${scope}`
      );
      streamsProcessed += 1;
      eventsIngested += result.processed;
      streamStats.push({
        scope,
        chainId: chain.chainId,
        standard: "eip7702",
        eventName: "authorization",
        logsFetched: result.processed + result.failed,
        logsPersisted: result.processed,
        logsSkippedByAgentFilter: 0,
        logsFailed: result.failed,
        fromBlock: null,
        toBlock: null,
      });
      errors.push(...result.errors);
    } catch (error: any) {
      errors.push(`[${chain.chainId}:eip7702] ${clampErrorMessage(error)}`);
    }
  }

  return {
    streamsProcessed,
    eventsIngested,
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    streamStats,
  };
}
