import { PageContainer } from "@/components/layout/PageContainer";
import { AgentProfile } from "@/components/agents/AgentProfile";
import { notFound } from "next/navigation";
import { getSiteBaseUrl } from "@/lib/site-url";

export const revalidate = 60;

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
