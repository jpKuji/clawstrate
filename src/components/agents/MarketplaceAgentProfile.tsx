"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/shared/SourceBadge";

interface MarketplaceMetricBlock {
  bountiesPosted: number;
  totalApplicationsReceived: number;
  uniqueContributors: number;
  assignmentRate: number;
  medianBountyPrice: number | null;
  categorySpread: Array<{
    category: string;
    count: number;
    share: number;
  }>;
  recentPostingCadence: number;
}

interface MarketplaceAction {
  id: string;
  title: string | null;
  content: string | null;
  performedAt: string;
  replyCount: number | null;
  rawData?: Record<string, unknown> | null;
}

function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || Number.isNaN(amount)) return "N/A";
  if (!currency || currency === "USD") return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency}`;
}

export function MarketplaceAgentProfile({
  agent,
  marketplaceMetrics,
  recentActions,
}: {
  agent: {
    id: string;
    displayName: string;
    displayLabel?: string;
    description: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    totalActions: number | null;
  };
  marketplaceMetrics: MarketplaceMetricBlock;
  recentActions: MarketplaceAction[];
}) {
  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {agent.displayLabel || agent.displayName}
            </h1>
            {agent.description && (
              <p className="mt-1 text-sm text-zinc-400">{agent.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <SourceBadge sourceId="rentahuman" size="sm" />
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              marketplace_ai
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-zinc-800 md:grid-cols-4">
        {[
          { label: "Bounties Posted", value: marketplaceMetrics.bountiesPosted },
          {
            label: "Applications",
            value: marketplaceMetrics.totalApplicationsReceived,
          },
          {
            label: "Unique Contributors",
            value: marketplaceMetrics.uniqueContributors,
          },
          {
            label: "Assignment Rate",
            value: `${(marketplaceMetrics.assignmentRate * 100).toFixed(1)}%`,
          },
        ].map((metric) => (
          <div key={metric.label} className="bg-[var(--panel-bg)] p-4">
            <p className="text-[10px] uppercase tracking-widest text-accent">
              {metric.label}
            </p>
            <p className="mt-1 font-data text-xl font-bold text-zinc-100">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
              Marketplace Benchmarks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-zinc-500">Median bounty price</span>
              <span className="font-medium text-zinc-200">
                {formatMoney(
                  marketplaceMetrics.medianBountyPrice,
                  "USD"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-zinc-500">Posting cadence (7d equiv.)</span>
              <span className="font-medium text-zinc-200">
                {marketplaceMetrics.recentPostingCadence.toFixed(2)} posts/week
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-zinc-500">First seen</span>
              <span className="font-medium text-zinc-200">
                {new Date(agent.firstSeenAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Last active</span>
              <span className="font-medium text-zinc-200">
                {new Date(agent.lastSeenAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
              Category Spread
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {marketplaceMetrics.categorySpread.length === 0 ? (
              <p className="text-sm text-zinc-500">No category data yet</p>
            ) : (
              marketplaceMetrics.categorySpread.map((category) => (
                <div key={category.category}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{category.category}</span>
                    <span className="text-zinc-500">
                      {category.count} ({(category.share * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800">
                    <div
                      className="h-full bg-teal-500"
                      style={{ width: `${Math.max(category.share * 100, 2)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">
            Recent Bounties
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActions.length === 0 ? (
            <p className="text-sm text-zinc-500">No bounties yet</p>
          ) : (
            <div className="space-y-3">
              {recentActions.map((action) => {
                const raw = (action.rawData || {}) as Record<string, unknown>;
                const category =
                  typeof raw.category === "string" ? raw.category : null;
                const price =
                  typeof raw.price === "number" ? raw.price : Number(raw.price);
                const currency =
                  typeof raw.currency === "string" ? raw.currency : "USD";

                return (
                  <div
                    key={action.id}
                    className="border-b border-zinc-800 pb-3 last:border-0"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200">
                        {action.title || "Untitled bounty"}
                      </p>
                      {category && (
                        <Badge
                          variant="outline"
                          className="border-zinc-700 text-zinc-400 text-xs"
                        >
                          {category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>
                        {Number.isFinite(price)
                          ? formatMoney(price, currency)
                          : "No budget listed"}
                      </span>
                      <span>{action.replyCount ?? 0} applications</span>
                      <span>{new Date(action.performedAt).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
