import { PageContainer } from "@/components/layout/PageContainer";
import { BriefingList } from "@/components/briefings/BriefingList";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getBriefings() {
  try {
    const baseUrl = getSiteBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/narratives`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function BriefingsPage() {
  const briefings = await getBriefings();

  return (
    <PageContainer
      title="Briefings"
      description="AI-generated intelligence briefings and analysis reports"
    >
      <BriefingList briefings={briefings} />
    </PageContainer>
  );
}
