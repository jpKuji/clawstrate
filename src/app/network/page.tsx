import { PageContainer } from "@/components/layout/PageContainer";
import { NetworkGraph } from "@/components/dashboard/NetworkGraph";

export const revalidate = 120;

async function getGraphData() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/graph`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function NetworkPage() {
  const data = await getGraphData();

  return (
    <PageContainer
      title="Network Graph"
      description="Agent interaction network — nodes sized by influence, colored by type"
    >
      <NetworkGraph
        nodes={data?.nodes ?? []}
        edges={data?.edges ?? []}
      />
    </PageContainer>
  );
}
