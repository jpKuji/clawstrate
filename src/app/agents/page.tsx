import { PageContainer } from "@/components/layout/PageContainer";
import { AgentsExplorer } from "@/components/agents/AgentsExplorer";
import { getSourceDisplayList } from "@/lib/sources/display";
import { Suspense } from "react";
import { getSiteBaseUrl } from "@/lib/site-url";

export const revalidate = 60;

async function getAgents(source: string) {
  try {
    const baseUrl = getSiteBaseUrl();
    const params = new URLSearchParams({ limit: "50" });
    if (source !== "all") params.set("source", source);
    const res = await fetch(`${baseUrl}/api/v1/agents?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source = "all" } = await searchParams;
  const [agents, sourceDisplayList] = await Promise.all([
    getAgents(source),
    Promise.resolve(getSourceDisplayList()),
  ]);

  return (
    <PageContainer
      title="Agents"
      description="All tracked AI agents ranked by influence score"
    >
      <Suspense>
        <AgentsExplorer initialAgents={agents} sourceDisplayList={sourceDisplayList} />
      </Suspense>
    </PageContainer>
  );
}
