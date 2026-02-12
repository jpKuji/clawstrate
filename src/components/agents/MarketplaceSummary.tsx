"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketplaceData {
  totalBounties: number;
  totalAssignments: number;
  fulfillmentRate: number;
  priceStats: { avg: number; min: number; max: number };
  topCategories: Array<{ name: string; count: number }>;
  topSkills: Array<{ skill: string; count: number }>;
}

export function MarketplaceSummary() {
  const [data, setData] = useState<MarketplaceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/marketplace")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => console.error("Failed to fetch marketplace data:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-zinc-800 bg-zinc-900 p-4 mb-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 bg-zinc-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32 bg-zinc-800" />
          <Skeleton className="h-32 bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxCategoryCount = Math.max(...data.topCategories.map((c) => c.count), 1);

  return (
    <div className="border border-zinc-800 bg-zinc-900 p-4 mb-4 space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-accent">Marketplace Overview</p>

      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800">
        {[
          { label: "Bounties Posted", value: data.totalBounties.toLocaleString() },
          { label: "Assignments", value: data.totalAssignments.toLocaleString() },
          { label: "Fulfillment Rate", value: `${data.fulfillmentRate}%` },
          { label: "Avg Price", value: data.priceStats.avg > 0 ? `$${data.priceStats.avg.toFixed(0)}` : "N/A" },
        ].map((metric) => (
          <div key={metric.label} className="bg-zinc-900 p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">{metric.label}</p>
            <p className="text-lg font-bold font-data text-zinc-100 mt-0.5">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Row 2: Demand Signals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Categories */}
        {data.topCategories.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Top Categories</p>
            <div className="space-y-1.5">
              {data.topCategories.slice(0, 6).map((cat) => (
                <div key={cat.name} className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-teal-900/60 rounded"
                      style={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-24 truncate">{cat.name}</span>
                  <span className="text-xs text-zinc-500 font-data w-8 text-right">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Skills */}
        {data.topSkills.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Most Requested Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {data.topSkills.map((s) => (
                <span
                  key={s.skill}
                  className="text-xs px-2 py-0.5 rounded-full border border-teal-800/50 text-teal-400/80 bg-teal-950/20"
                >
                  {s.skill}
                  <span className="text-teal-600 ml-1">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
