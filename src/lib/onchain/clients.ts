import { createPublicClient, fallback, http } from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import type { ChainId } from "./types";

const clientCache = new Map<ChainId, any>();

function toChain(chainId: ChainId) {
  switch (chainId) {
    case 1:
      return mainnet;
    case 8453:
      return base;
    case 42161:
      return arbitrum;
    case 10:
      return optimism;
    case 137:
      return polygon;
    default:
      return mainnet;
  }
}

function envRpcUrls(chainId: ChainId): string[] {
  const scoped = process.env[`ONCHAIN_RPC_${chainId}` as keyof NodeJS.ProcessEnv];
  if (!scoped) return [];
  return scoped
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function buildRpcUrlList(chainId: ChainId, manifestRpcUrls: string[]): string[] {
  const envUrls = envRpcUrls(chainId);
  const merged = [...envUrls, ...manifestRpcUrls];
  const unique = Array.from(new Set(merged));
  return unique;
}

export function getPublicClient(chainId: ChainId, rpcUrls: string[]): any {
  if (clientCache.has(chainId)) {
    return clientCache.get(chainId)!;
  }

  const transports = rpcUrls.map((url) =>
    http(url, {
      retryCount: 1,
      timeout: 15_000,
    })
  );

  const transport =
    transports.length > 1
      ? fallback(transports, {
          rank: true,
          retryCount: 1,
        })
      : transports[0] ?? http();

  const client = createPublicClient({
    chain: toChain(chainId),
    transport,
  });

  clientCache.set(chainId, client);
  return client;
}
