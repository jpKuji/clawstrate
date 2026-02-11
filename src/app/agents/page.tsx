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
    <PageContainer
      title="Agents"
      description="All tracked AI agents ranked by influence score"
    >
      <div className="border border-zinc-800 bg-[var(--panel-bg)] overflow-hidden">
        <AgentTable agents={agents} />
      </div>
    </PageContainer>
  );
}
