import { PageContainer } from "@/components/layout/PageContainer";
import { TopicsExplorer } from "@/components/topics/TopicsExplorer";
import { getSourceDisplayList } from "@/lib/sources/display";
import { Suspense } from "react";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function getTopics(source: string) {
  try {
    const baseUrl = getSiteBaseUrl();
    const params = new URLSearchParams({ limit: "50" });
    if (source !== "all") params.set("source", source);
    const res = await fetch(`${baseUrl}/api/v1/topics?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source = "all" } = await searchParams;
  const [topics, sourceDisplayList] = await Promise.all([
    getTopics(source),
    Promise.resolve(getSourceDisplayList()),
  ]);

  return (
    <PageContainer
      title="Topics"
      description="Tracked discussion topics by velocity (actions/hour)"
    >
      <Suspense>
        <TopicsExplorer initialTopics={topics} sourceDisplayList={sourceDisplayList} />
      </Suspense>
    </PageContainer>
  );
}
