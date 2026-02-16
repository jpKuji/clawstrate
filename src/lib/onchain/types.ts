export type ChainId = 1 | 8453 | 42161 | 10 | 137;

export type OnchainStandard =
  | "erc8004"
  | "erc6551"
  | "erc4337"
  | "erc8001"
  | "erc7007"
  | "erc7579"
  | "eip7702";

export interface ContractStream {
  chainId: ChainId;
  standard: OnchainStandard;
  role: string;
  address: `0x${string}`;
  startBlock: bigint;
  enabled: boolean;
  eventName: string;
  eventAbi: string;
  // ERC-8004 reputation/validation streams need the identity registry to construct agent keys.
  identityRegistryAddress?: `0x${string}`;
}

export interface OnchainIngestResult {
  streamsProcessed: number;
  eventsIngested: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  streamStats: Array<{
    scope: string;
    chainId: ChainId;
    standard: OnchainStandard | "eip7702";
    eventName: string;
    logsFetched: number;
    logsPersisted: number;
    logsSkippedByAgentFilter: number;
    fromBlock: number | null;
    toBlock: number | null;
  }>;
}

export interface ChainManifestEntry {
  chainId: ChainId;
  name: string;
  enabled: boolean;
  rpcUrls: string[];
  startBlock: number;
  contracts: {
    erc8004?: {
      identityRegistry?: `0x${string}` | null;
      reputationRegistry?: `0x${string}` | null;
      validationRegistry?: `0x${string}` | null;
    };
    erc6551Registry?: `0x${string}` | null;
    erc4337EntryPoints?: `0x${string}`[];
    // Legacy single-entrypoint field kept for backward compatibility while migrating manifests.
    erc4337EntryPoint?: `0x${string}` | null;
    erc8001Contracts?: `0x${string}`[];
    erc7007Contracts?: `0x${string}`[];
    erc7579Accounts?: `0x${string}`[];
  };
}

export interface OnchainManifest {
  chains: ChainManifestEntry[];
}
