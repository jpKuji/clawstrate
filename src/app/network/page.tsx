import { PageContainer } from "@/components/layout/PageContainer";
import { NetworkExplorer } from "@/components/dashboard/NetworkExplorer";
import type { GraphApiResponse } from "@/lib/network/types";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getGraphData(): Promise<GraphApiResponse | null> {
  try {
    const baseUrl = getSiteBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/v1/graph?source=all&windowDays=30&maxNodes=50`,
      {
        next: { revalidate: 120 },
      }
    );

    if (!response.ok) return null;
    return (await response.json()) as GraphApiResponse;
  } catch {
    return null;
  }
}

export default async function NetworkPage() {
  const data = await getGraphData();

  return (
    <PageContainer
      title="Network Graph"
      description="Interactive agent interaction map with source, window, and segmentation controls"
    >
      <NetworkExplorer initialData={data} />
    </PageContainer>
  );
}
