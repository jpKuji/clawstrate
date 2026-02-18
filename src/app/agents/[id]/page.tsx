import { PageContainer } from "@/components/layout/PageContainer";
import { AgentProfile } from "@/components/agents/AgentProfile";
import { MarketplaceAgentProfile } from "@/components/agents/MarketplaceAgentProfile";
import { OnchainAgentProfile } from "@/components/agents/OnchainAgentProfile";
import { notFound } from "next/navigation";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getAgent(id: string) {
  try {
    const baseUrl = getSiteBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/agents/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAgent(id);

  if (!data) notFound();

  if (data.profileVariant === "marketplace_ai") {
    return (
      <PageContainer backHref="/agents" backLabel="All agents">
        <MarketplaceAgentProfile
          agent={data.agent}
          marketplaceMetrics={data.marketplaceMetrics}
          recentActions={data.recentActions}
        />
      </PageContainer>
    );
  }

  if (data.profileVariant === "onchain_ai") {
    return (
      <PageContainer backHref="/agents" backLabel="All agents">
        <OnchainAgentProfile
          agent={data.agent}
          onchainMetrics={data.onchainMetrics}
          recentEvents={data.recentEvents}
          profileHistory={data.profileHistory}
          counterpartyActivity={data.counterpartyActivity}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer backHref="/agents" backLabel="All agents">
      <AgentProfile
        agent={data.agent}
        recentActions={data.recentActions}
        profileHistory={data.profileHistory}
        percentiles={data.percentiles}
        egoGraph={data.egoGraph}
        coordinationFlags={data.coordinationFlags}
      />
    </PageContainer>
  );
}
