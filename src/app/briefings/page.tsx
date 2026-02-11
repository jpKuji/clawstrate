import { PageContainer } from "@/components/layout/PageContainer";
import { BriefingList } from "@/components/briefings/BriefingList";

export const revalidate = 60;

async function getBriefings() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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
