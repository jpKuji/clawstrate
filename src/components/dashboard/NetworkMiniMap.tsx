"use client";

import { NetworkGraph } from "./NetworkGraph";
import type { NetworkGraphNode, NetworkGraphEdge } from "@/lib/network/types";

export function NetworkMiniMap({
  nodes,
  edges,
}: {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
}) {
  // Limit to top 25 nodes by interaction weight for compact view
  const topNodeIds = new Set(
    [...nodes]
      .sort((a, b) => b.interactionWeight - a.interactionWeight)
      .slice(0, 25)
      .map((n) => n.id)
  );

  const filteredNodes = nodes.filter((n) => topNodeIds.has(n.id));
  const filteredEdges = edges.filter(
    (e) => topNodeIds.has(e.source) && topNodeIds.has(e.target)
  );

  // Only include nodes that have at least one edge
  const connectedIds = new Set<string>();
  for (const e of filteredEdges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const finalNodes = filteredNodes.filter((n) => connectedIds.has(n.id));

  if (finalNodes.length === 0 || filteredEdges.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-zinc-600">
        No network data available
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden [&_canvas]:!rounded-none [&_.space-y-4]:!space-y-0 [&>div>div:first-child]:hidden [&>div>div:last-child]:hidden [&_aside]:hidden [&_.grid]:!grid-cols-1">
      <NetworkGraph
        nodes={finalNodes}
        edges={filteredEdges}
        colorMode="agentType"
      />
    </div>
  );
}
