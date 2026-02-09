import { PageContainer } from "@/components/layout/PageContainer";
import { AgentProfile } from "@/components/agents/AgentProfile";
import { notFound } from "next/navigation";

export const revalidate = 60;

async function getAgent(id: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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
    <PageContainer>
      <AgentProfile
        agent={data.agent}
        recentActions={data.recentActions}
        profileHistory={data.profileHistory}
      />
    </PageContainer>
  );
}
