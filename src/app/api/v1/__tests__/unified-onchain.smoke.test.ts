import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, type MockDb } from "@/__tests__/mocks/db";

let mockDb: MockDb;

vi.mock("@/lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

import { GET as listAgents } from "@/app/api/v1/agents/route";
import { GET as getAgent } from "@/app/api/v1/agents/[id]/route";
import { GET as listTopics } from "@/app/api/v1/topics/route";
import { GET as getTopic } from "@/app/api/v1/topics/[slug]/route";

function chainableSelect(resolveData: any[]) {
  const chain: any = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") return (resolve: any) => resolve(resolveData);
        return () => chain;
      },
    }
  );
  return chain;
}

describe("Unified onchain smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it("smoke: agents onchain list + detail", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          agent_key: "1:0xregistry:42",
          chain_id: 1,
          owner_address: "0xowner",
          agent_wallet: "0xwallet",
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-02T00:00:00.000Z"),
          display_name: "Onchain Agent",
          description: "desc",
          total_events: 15,
          events_24h: 7,
          unique_event_types: 4,
          proactive_events: 5,
          reactive_events: 2,
        },
      ],
    });

    const listRes = await listAgents(new NextRequest("http://localhost/api/v1/agents?source=onchain"));
    const listBody = await listRes.json();

    expect(listRes.status).toBe(200);
    expect(listBody[0].id).toBe("onchain:1:0xregistry:42");

    mockDb.select
      .mockImplementationOnce(() =>
        chainableSelect([
          {
            agentKey: "1:0xregistry:42",
            chainId: 1,
            registryAddress: "0xregistry",
            agentId: "42",
            ownerAddress: "0xowner",
            agentUri: "ipfs://agent",
            agentWallet: "0xwallet",
            isActive: true,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            name: "Onchain Agent",
            description: "desc",
            protocols: ["x402"],
            x402Supported: true,
            parseStatus: "success",
            serviceEndpoints: {},
            crossChain: [],
          },
        ])
      )
      .mockImplementation(() => chainableSelect([{ count: 0 }]));

    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            total_events: 15,
            events_24h: 7,
            unique_event_types: 4,
            proactive_events: 5,
            reactive_events: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ day: "2026-01-02", events: 7, proactive_events: 5, reactive_events: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            chain_id: 1,
            tx_hash: "0xtx",
            log_index: 0,
            block_time: new Date("2026-01-02T00:00:00.000Z"),
            standard: "erc8004",
            event_name: "Registered",
            topic_slugs: ["agent-registration"],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ address: "0xclient", role: "feedback_client", count: 2 }] });

    const detailRes = await getAgent(new NextRequest("http://localhost/api/v1/agents/onchain:1:0xregistry:42"), {
      params: Promise.resolve({ id: "onchain:1:0xregistry:42" }),
    });
    const detailBody = await detailRes.json();

    expect(detailRes.status).toBe(200);
    expect(detailBody.profileVariant).toBe("onchain_ai");
    expect(detailBody.recentEvents.length).toBeGreaterThan(0);
  });

  it("smoke: topics all + onchain-only topic detail", async () => {
    mockDb.query.topics.findMany.mockResolvedValueOnce([
      {
        id: "topic-1",
        slug: "agent-registration",
        name: "Agent Registration",
        description: null,
        velocity: 0.2,
        actionCount: 5,
        agentCount: 2,
        avgSentiment: null,
        lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          topic_slug: "agent-registration",
          topic_name: "Agent Registration",
          velocity: 0.8,
          action_count: 20,
          agent_count: 7,
          last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });

    const listRes = await listTopics(new NextRequest("http://localhost/api/v1/topics?source=all"));
    const listBody = await listRes.json();

    expect(listRes.status).toBe(200);
    expect(listBody[0].slug).toBe("agent-registration");
    expect(listBody[0].actionCount).toBe(25);

    mockDb.query.topics.findFirst.mockResolvedValueOnce(null);
    mockDb.query.topicAliases.findFirst.mockResolvedValueOnce(null);

    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            topic_name: "Agent Registration",
            action_count: 12,
            agent_count: 4,
            velocity: 0.5,
            last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            chain_id: 1,
            tx_hash: "0xtx",
            log_index: 0,
            block_time: new Date("2026-01-03T00:00:00.000Z"),
            standard: "erc8004",
            event_name: "Registered",
            agent_keys: ["1:0xregistry:42"],
            agent_names: ["Onchain Agent"],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ agent_key: "1:0xregistry:42", agent_name: "Onchain Agent", action_count: 6 }],
      })
      .mockResolvedValueOnce({
        rows: [{ slug: "protocol-identity-layer", name: "Protocol Identity Layer", count: 5 }],
      });

    const detailRes = await getTopic(new NextRequest("http://localhost/api/v1/topics/agent-registration"), {
      params: Promise.resolve({ slug: "agent-registration" }),
    });
    const detailBody = await detailRes.json();

    expect(detailRes.status).toBe(200);
    expect(detailBody.topic.id).toBe("onchain:agent-registration");
    expect(detailBody.recentActions.length).toBeGreaterThan(0);
  });
});
