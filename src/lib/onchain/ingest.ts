import { and, eq, inArray, isNotNull } from "drizzle-orm";
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
  onchainEventLogs,
  pipelineStageCursors,
} from "@/lib/db/schema";
import { buildRpcUrlList, getPublicClient } from "./clients";
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

const STAGE_NAME = "onchain";
const REORG_WINDOW = 12;
const MAX_BLOCKS_PER_STREAM = 3_000;
const MAX_BLOCKS_EIP7702 = 120;

interface StreamRange {
  fromBlock: number;
  toBlock: number;
}

function asNum(value: bigint | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
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
      {
        standard: "erc4337",
        role: "entrypoint",
        address: chain.contracts.erc4337EntryPoint,
      },
    ];

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

async function processStreamEvent(input: {
  stream: ContractStream;
  log: any;
  blockTime: Date;
}): Promise<void> {
  const { stream, log } = input;
  const args = (log.args ?? {}) as Record<string, unknown>;
  const txHash = asText(log.transactionHash) ?? "";
  const blockNumber = asNum(log.blockNumber);

  await insertCanonicalLog(input);

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

    if (stream.eventName === "NewFeedback") {
      const client = normalizeAddress(args.clientAddress) ?? "";
      const feedbackIndex = asNum(args.feedbackIndex as bigint | number);
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
      const feedbackIndex = asNum(args.feedbackIndex as bigint | number);
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
      const feedbackIndex = asNum(args.feedbackIndex as bigint | number);
      const feedbackKey = `${agentKey}:${client}:${feedbackIndex}`;

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

async function fetchBlockTime(
  client: any,
  blockNumber: bigint,
  cache: Map<string, Date>
): Promise<Date> {
  const key = blockNumber.toString();
  if (cache.has(key)) return cache.get(key)!;
  const block = await client.getBlock({ blockNumber });
  const date = toDateFromUnix(block.timestamp);
  cache.set(key, date);
  return date;
}

async function ingestStream(
  stream: ContractStream,
  opts: { backfill?: boolean }
): Promise<{ processed: number; errors: string[] }> {
  const chainConfig = chainConfigById(stream.chainId);
  const client = getPublicClient(stream.chainId, buildRpcUrlList(stream.chainId, chainConfig.rpcUrls));
  const latestBlock = asNum(await client.getBlockNumber());
  const scope = streamScope(stream);
  const cursorBlock = await getCursorBlock(scope);
  const range = computeRange(latestBlock, asNum(stream.startBlock), cursorBlock, {
    backfill: opts.backfill,
    maxBlocks: MAX_BLOCKS_PER_STREAM,
  });

  if (!range) {
    return { processed: 0, errors: [] };
  }

  const event = parseEventAbi(stream.eventAbi);
  const logs = await client.getLogs({
    address: stream.address,
    event,
    fromBlock: BigInt(range.fromBlock),
    toBlock: BigInt(range.toBlock),
    strict: false,
  });

  const blockTimeCache = new Map<string, Date>();
  for (const log of logs as any[]) {
    const blockTime = await fetchBlockTime(client, log.blockNumber, blockTimeCache);
    await processStreamEvent({ stream, log, blockTime });
  }

  await setCursorBlock(scope, range.toBlock);
  return { processed: logs.length, errors: [] };
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
  opts: { backfill?: boolean }
): Promise<{ processed: number; errors: string[] }> {
  const client = getPublicClient(chain.chainId, buildRpcUrlList(chain.chainId, chain.rpcUrls));
  const latestBlock = asNum(await client.getBlockNumber());
  const scope = `chain:${chain.chainId}:eip7702`;
  const cursorBlock = await getCursorBlock(scope);
  const range = computeRange(latestBlock, chain.startBlock, cursorBlock, {
    backfill: opts.backfill,
    maxBlocks: MAX_BLOCKS_EIP7702,
  });

  if (!range) {
    return { processed: 0, errors: [] };
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
    return { processed: 0, errors: [] };
  }

  let processed = 0;
  for (let blockNumber = range.fromBlock; blockNumber <= range.toBlock; blockNumber++) {
    const block = await client.getBlock({
      blockNumber: BigInt(blockNumber),
      includeTransactions: true,
    });

    for (const tx of block.transactions as any[]) {
      if (!tx || typeof tx === "string") continue;
      if (!txTypeIsEip7702(tx.type)) continue;

      const from = normalizeAddress(tx.from);
      if (!from || !knownWallets.has(from)) continue;

      const authorizationList = Array.isArray(tx.authorizationList)
        ? (safeSerialize(tx.authorizationList) as Record<string, unknown>[])
        : [];

      await db
        .insert(eip7702Authorizations)
        .values({
          chainId: chain.chainId,
          txHash: asText(tx.hash) ?? "",
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
    }
  }

  await setCursorBlock(scope, range.toBlock);
  return { processed, errors: [] };
}

export async function runOnchainIngestion(opts?: {
  backfill?: boolean;
}): Promise<OnchainIngestResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let streamsProcessed = 0;
  let eventsIngested = 0;

  await upsertManifestRows();

  const manifest = getOnchainManifest();
  const streams = buildContractStreams(manifest).filter((stream) => stream.enabled);

  for (const stream of streams) {
    try {
      const result = await ingestStream(stream, opts ?? {});
      streamsProcessed += 1;
      eventsIngested += result.processed;
    } catch (error: any) {
      errors.push(
        `[${stream.chainId}:${stream.standard}:${stream.eventName}] ${error?.message ?? "unknown_error"}`
      );
    }
  }

  for (const chain of manifest.chains.filter((chain) => chain.enabled)) {
    try {
      const result = await ingestEip7702ForChain(chain, opts ?? {});
      streamsProcessed += 1;
      eventsIngested += result.processed;
    } catch (error: any) {
      errors.push(`[${chain.chainId}:eip7702] ${error?.message ?? "unknown_error"}`);
    }
  }

  return {
    streamsProcessed,
    eventsIngested,
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}
