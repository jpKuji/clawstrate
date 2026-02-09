import { Badge } from "@/components/ui/badge";

export function TrendBadge({ value, label }: { value: number; label?: string }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  return (
    <Badge
      variant="outline"
      className={
        isNeutral
          ? "border-zinc-700 text-zinc-400"
          : isPositive
            ? "border-emerald-800 text-emerald-400"
            : "border-red-800 text-red-400"
      }
    >
      {isPositive ? "+" : ""}
      {typeof value === "number" ? value.toFixed(2) : value}
      {label && ` ${label}`}
    </Badge>
  );
}
