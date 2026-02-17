import { parseAbiItem, type AbiEvent } from "viem";
import manifestJson from "./contracts.manifest.json";
import type { ChainId, ChainManifestEntry, ContractStream, OnchainManifest, OnchainStandard } from "./types";

interface StreamSpec {
  standard: OnchainStandard;
  role: string;
  eventName: string;
  eventAbi: string;
}

const STREAM_SPECS: StreamSpec[] = [
  {
    standard: "erc8004",
    role: "identity_registry",
    eventName: "Registered",
    eventAbi: "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  },
  {
    standard: "erc8004",
    role: "identity_registry",
    eventName: "MetadataSet",
    eventAbi:
      "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
  },
  {
    standard: "erc8004",
    role: "identity_registry",
    eventName: "URIUpdated",
    eventAbi: "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  },
  {
    standard: "erc8004",
    role: "identity_registry",
    eventName: "AgentWalletSet",
    eventAbi: "event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed setBy)",
  },
  {
    standard: "erc8004",
    role: "reputation_registry",
    eventName: "NewFeedback",
    eventAbi:
      "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  },
  {
    standard: "erc8004",
    role: "reputation_registry",
    eventName: "FeedbackRevoked",
    eventAbi:
      "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
  },
  {
    standard: "erc8004",
    role: "reputation_registry",
    eventName: "ResponseAppended",
    eventAbi:
      "event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)",
  },
  {
    standard: "erc8004",
    role: "validation_registry",
    eventName: "ValidationRequest",
    eventAbi:
      "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)",
  },
  {
    standard: "erc8004",
    role: "validation_registry",
    eventName: "ValidationResponse",
    eventAbi:
      "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  },
  {
    standard: "erc6551",
    role: "registry",
    eventName: "ERC6551AccountCreated",
    eventAbi:
      "event ERC6551AccountCreated(address account, address indexed implementation, bytes32 salt, uint256 indexed chainId, address indexed tokenContract, uint256 tokenId)",
  },
  {
    standard: "erc4337",
    role: "entrypoint",
    eventName: "UserOperationEvent",
    eventAbi:
      "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  },
  {
    standard: "erc4337",
    role: "entrypoint",
    eventName: "AccountDeployed",
    eventAbi:
      "event AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)",
  },
  {
    standard: "erc8001",
    role: "coordination",
    eventName: "CoordinationProposed",
    eventAbi:
      "event CoordinationProposed(bytes32 indexed intentHash, address indexed proposer, bytes32 coordinationType, uint256 participantCount, uint256 coordinationValue)",
  },
  {
    standard: "erc8001",
    role: "coordination",
    eventName: "CoordinationAccepted",
    eventAbi:
      "event CoordinationAccepted(bytes32 indexed intentHash, address indexed participant, bytes32 acceptanceHash, uint256 acceptedCount, uint256 requiredCount)",
  },
  {
    standard: "erc8001",
    role: "coordination",
    eventName: "CoordinationExecuted",
    eventAbi:
      "event CoordinationExecuted(bytes32 indexed intentHash, address indexed executor, bool success, uint256 gasUsed, bytes result)",
  },
  {
    standard: "erc8001",
    role: "coordination",
    eventName: "CoordinationCancelled",
    eventAbi:
      "event CoordinationCancelled(bytes32 indexed intentHash, address indexed canceller, string reason, uint8 finalStatus)",
  },
  {
    standard: "erc7007",
    role: "token",
    eventName: "AigcData",
    eventAbi:
      "event AigcData(uint256 indexed tokenId, bytes indexed prompt, bytes indexed aigcData, bytes proof)",
  },
  {
    standard: "erc7579",
    role: "module_config",
    eventName: "ModuleInstalled",
    eventAbi: "event ModuleInstalled(uint256 moduleTypeId, address module)",
  },
  {
    standard: "erc7579",
    role: "module_config",
    eventName: "ModuleUninstalled",
    eventAbi: "event ModuleUninstalled(uint256 moduleTypeId, address module)",
  },
];

export function getOnchainManifest(): OnchainManifest {
  return manifestJson as OnchainManifest;
}

function asAddress(value: string | null | undefined): `0x${string}` | null {
  if (!value) return null;
  const candidate = value.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(candidate)) return null;
  return candidate as `0x${string}`;
}

function parseAbi(value: string): AbiEvent {
  return parseAbiItem(value) as AbiEvent;
}

function getErc4337EntryPoints(chain: ChainManifestEntry): `0x${string}`[] {
  const parsed: `0x${string}`[] = [];
  for (const candidate of chain.contracts.erc4337EntryPoints ?? []) {
    const address = asAddress(candidate);
    if (address) parsed.push(address);
  }

  // Backward compatibility for older manifests with a single entrypoint.
  const legacy = asAddress(chain.contracts.erc4337EntryPoint ?? null);
  if (legacy) parsed.push(legacy);

  return Array.from(new Set(parsed));
}

function streamFor(
  chain: ChainManifestEntry,
  standard: OnchainStandard,
  role: string,
  address: `0x${string}`,
  startBlock: number,
  identityRegistryAddress: `0x${string}` | null = null
): ContractStream[] {
  return STREAM_SPECS.filter((spec) => spec.standard === standard && spec.role === role).map((spec) => ({
    chainId: chain.chainId,
    standard,
    role,
    address,
    startBlock: BigInt(startBlock),
    enabled: chain.enabled,
    eventName: spec.eventName,
    eventAbi: spec.eventAbi,
    identityRegistryAddress: identityRegistryAddress ?? undefined,
  }));
}

export function buildContractStreams(manifest: OnchainManifest): ContractStream[] {
  const streams: ContractStream[] = [];

  for (const chain of manifest.chains) {
    if (!chain.enabled) continue;

    const identity = asAddress(chain.contracts.erc8004?.identityRegistry ?? null);
    const reputation = asAddress(chain.contracts.erc8004?.reputationRegistry ?? null);
    const validation = asAddress(chain.contracts.erc8004?.validationRegistry ?? null);

    if (identity) {
      streams.push(
        ...streamFor(chain, "erc8004", "identity_registry", identity, chain.startBlock)
      );
    }

    if (reputation) {
      streams.push(
        ...streamFor(
          chain,
          "erc8004",
          "reputation_registry",
          reputation,
          chain.startBlock,
          identity
        )
      );
    }

    if (validation) {
      streams.push(
        ...streamFor(
          chain,
          "erc8004",
          "validation_registry",
          validation,
          chain.startBlock,
          identity
        )
      );
    }

    const erc6551 = asAddress(chain.contracts.erc6551Registry ?? null);
    if (erc6551) {
      streams.push(...streamFor(chain, "erc6551", "registry", erc6551, chain.startBlock));
    }

    const entryPoints = getErc4337EntryPoints(chain);
    for (const entryPoint of entryPoints) {
      streams.push(...streamFor(chain, "erc4337", "entrypoint", entryPoint, chain.startBlock));
    }

    for (const contract of chain.contracts.erc8001Contracts ?? []) {
      const parsed = asAddress(contract);
      if (parsed) {
        streams.push(...streamFor(chain, "erc8001", "coordination", parsed, chain.startBlock));
      }
    }

    for (const contract of chain.contracts.erc7007Contracts ?? []) {
      const parsed = asAddress(contract);
      if (parsed) {
        streams.push(...streamFor(chain, "erc7007", "token", parsed, chain.startBlock));
      }
    }

    for (const contract of chain.contracts.erc7579Accounts ?? []) {
      const parsed = asAddress(contract);
      if (parsed) {
        streams.push(...streamFor(chain, "erc7579", "module_config", parsed, chain.startBlock));
      }
    }
  }

  return streams;
}

export function streamScope(stream: ContractStream): string {
  return `chain:${stream.chainId}:${stream.standard}:${stream.role}:${stream.eventName}:${stream.address}`;
}

export function parseEventAbi(eventAbi: string): AbiEvent {
  return parseAbi(eventAbi);
}

export function makeAgentKey(
  chainId: ChainId,
  registryAddress: string,
  agentId: bigint | number | string
): string {
  return `${chainId}:${registryAddress.toLowerCase()}:${String(agentId)}`;
}

export function toDateFromUnix(seconds: bigint | number): Date {
  return new Date(Number(seconds) * 1000);
}
