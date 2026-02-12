"use client";

import { Badge } from "@/components/ui/badge";
import { getSourceDisplay, type SourceDisplayConfig } from "@/lib/sources/display";

export function SourceBadge({
  sourceId,
  size,
}: {
  sourceId: string;
  size?: "sm";
}) {
  const config = getSourceDisplay(sourceId);
  if (!config) return null;

  return (
    <Badge variant="outline" className={config.color}>
      {size === "sm" ? config.shortLabel : config.displayName}
    </Badge>
  );
}

export function SourceDot({
  sourceId,
  className,
}: {
  sourceId: string;
  className?: string;
}) {
  const config = getSourceDisplay(sourceId);
  if (!config) return null;

  return (
    <span
      className={`size-2 rounded-full ${config.dotColor}${className ? ` ${className}` : ""}`}
      title={config.displayName}
    />
  );
}
