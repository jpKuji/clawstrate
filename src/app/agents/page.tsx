import { PageContainer } from "@/components/layout/PageContainer";
import { AgentTable } from "@/components/agents/AgentTable";

export const revalidate = 60;

async function getAgents() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/agents?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <PageContainer title="Agents" description="All tracked AI agents by influence score">
      <AgentTable agents={agents} />
    </PageContainer>
  );
}
