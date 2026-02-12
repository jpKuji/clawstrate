import { PageContainer } from "@/components/layout/PageContainer";
import { TopicDetail } from "@/components/topics/TopicDetail";
import { notFound, redirect } from "next/navigation";
import { getSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

type TopicFetchResult =
  | { kind: "ok"; data: any }
  | { kind: "not_found" }
  | { kind: "error"; status: number };

async function getTopic(slug: string): Promise<TopicFetchResult> {
  try {
    const baseUrl = getSiteBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/topics/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "error", status: res.status };
    return { kind: "ok", data: await res.json() };
  } catch {
    return { kind: "error", status: 0 };
  }
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getTopic(slug);

  if (result.kind === "not_found") notFound();
  if (result.kind === "error") {
    return (
      <PageContainer backHref="/topics" backLabel="All topics">
        <div className="border border-zinc-800 bg-[var(--panel-bg)] p-5">
          <h1 className="text-lg font-semibold text-zinc-100 mb-2">
            Topic temporarily unavailable
          </h1>
          <p className="text-sm text-zinc-400">
            The server returned an error while loading this topic.
            {result.status ? ` (HTTP ${result.status})` : ""} Try again shortly.
          </p>
        </div>
      </PageContainer>
    );
  }

  const data = result.data;

  if (data?.isAlias && data?.canonicalSlug && data.canonicalSlug !== slug) {
    redirect(`/topics/${data.canonicalSlug}`);
  }

  return (
    <PageContainer backHref="/topics" backLabel="All topics">
      <TopicDetail
        topic={data.topic}
        recentActions={data.recentActions}
        cooccurringTopics={data.cooccurringTopics}
        topContributors={data.topContributors}
      />
    </PageContainer>
  );
}
