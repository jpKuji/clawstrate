import { PageContainer } from "@/components/layout/PageContainer";
import { TopicDetail } from "@/components/topics/TopicDetail";
import { notFound } from "next/navigation";

export const revalidate = 60;

async function getTopic(slug: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/topics/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getTopic(slug);

  if (!data) notFound();

  return (
    <PageContainer>
      <TopicDetail topic={data.topic} recentActions={data.recentActions} />
    </PageContainer>
  );
}
