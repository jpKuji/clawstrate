import { NextRequest, NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  erc8004AgentMetadata,
  erc8004Agents,
  erc8004Feedbacks,
  erc8004Validations,
} from "@/lib/db/schema";
import { enforceOnchainQuota, getAccountIdFromRequest } from "@/lib/onchain/quota";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ agentKey: string }> }
) {
  const accountId = getAccountIdFromRequest(req.headers);
  const gate = await enforceOnchainQuota({ accountId, eventType: "onchain_api_call" });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, quota: gate.quota }, { status: gate.status });
  }

  const { agentKey } = await context.params;

  const [agent] = await db
    .select({
      agentKey: erc8004Agents.agentKey,
      chainId: erc8004Agents.chainId,
      registryAddress: erc8004Agents.registryAddress,
      agentId: erc8004Agents.agentId,
      ownerAddress: erc8004Agents.ownerAddress,
      agentUri: erc8004Agents.agentUri,
      agentWallet: erc8004Agents.agentWallet,
      isActive: erc8004Agents.isActive,
      lastEventBlock: erc8004Agents.lastEventBlock,
      createdAt: erc8004Agents.createdAt,
      updatedAt: erc8004Agents.updatedAt,
      name: erc8004AgentMetadata.name,
      description: erc8004AgentMetadata.description,
      protocols: erc8004AgentMetadata.protocols,
      x402Supported: erc8004AgentMetadata.x402Supported,
      parseStatus: erc8004AgentMetadata.parseStatus,
      serviceEndpoints: erc8004AgentMetadata.serviceEndpointsJson,
      crossChain: erc8004AgentMetadata.crossChainJson,
    })
    .from(erc8004Agents)
    .leftJoin(erc8004AgentMetadata, eq(erc8004AgentMetadata.agentKey, erc8004Agents.agentKey))
    .where(eq(erc8004Agents.agentKey, agentKey))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const [feedbackCount, validationCount] = await Promise.all([
    db
      .select({ count: count(erc8004Feedbacks.feedbackKey) })
      .from(erc8004Feedbacks)
      .where(eq(erc8004Feedbacks.agentKey, agentKey)),
    db
      .select({ count: count(erc8004Validations.requestHash) })
      .from(erc8004Validations)
      .where(and(eq(erc8004Validations.agentKey, agentKey), eq(erc8004Validations.status, "responded"))),
  ]);

  return NextResponse.json({
    ...agent,
    protocols: Array.isArray(agent.protocols) ? agent.protocols : [],
    metrics: {
      feedbacks: Number(feedbackCount[0]?.count ?? 0),
      validations: Number(validationCount[0]?.count ?? 0),
    },
  });
}
