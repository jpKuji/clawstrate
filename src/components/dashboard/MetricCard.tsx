"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendBadge } from "@/components/shared/TrendBadge";
import { Sparkline } from "@/components/shared/Sparkline";

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  sparklineData,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  sparklineData?: number[];
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold text-zinc-100">{value}</div>
          {trend !== undefined && <TrendBadge value={trend} />}
        </div>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-2">
            <Sparkline data={sparklineData} height={32} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
