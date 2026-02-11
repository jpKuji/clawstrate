import { PageContainer } from "@/components/layout/PageContainer";
import { TopicTable } from "@/components/topics/TopicTable";

export const revalidate = 60;

async function getTopics() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/topics?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <PageContainer
      title="Topics"
      description="Tracked discussion topics by velocity (actions/hour)"
    >
      <div className="border border-zinc-800 bg-[var(--panel-bg)] overflow-hidden">
        <TopicTable topics={topics} />
      </div>
    </PageContainer>
  );
}
