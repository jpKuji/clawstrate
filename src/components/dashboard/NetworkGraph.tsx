"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Button } from "@/components/ui/button";
import type {
  GraphColorMode,
  NetworkGraphEdge,
  NetworkGraphNode,
} from "@/lib/network/types";

interface GraphNodeDatum extends SimulationNodeDatum, NetworkGraphNode {}

interface GraphEdgeDatum extends SimulationLinkDatum<GraphNodeDatum> {
  source: string | GraphNodeDatum;
  target: string | GraphNodeDatum;
  weight: number;
  count: number;
}

const AGENT_TYPE_COLORS: Record<string, string> = {
  content_creator: "#10b981",
  commenter: "#3b82f6",
  active: "#14b8a6",
  conversationalist: "#8b5cf6",
  rising: "#ec4899",
  bot_farm: "#ef4444",
  lurker: "#6b7280",
};

const COMMUNITY_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#14b8a6",
  "#f43f5e",
  "#3b82f6",
  "#eab308",
  "#a855f7",
  "#14b8a6",
  "#fb7185",
  "#84cc16",
];

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatType(type: string | null): string {
  if (!type) return "unknown";
  return type.replaceAll("_", " ");
}

function getCommunityColor(label: number | null): string {
  if (label == null) return "#64748b";
  const normalized = Math.abs(label) % COMMUNITY_COLORS.length;
  return COMMUNITY_COLORS[normalized];
}

function getAutonomyColor(score: number | null): string {
  if (score == null) return "#64748b";
  const t = clamp(score, 0, 1);
  const hue = 8 + t * 130;
  const saturation = 72;
  const lightness = 44;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getEdgeNodeId(node: string | GraphNodeDatum): string {
  return typeof node === "string" ? node : node.id;
}

export function NetworkGraph({
  nodes: inputNodes,
  edges: inputEdges,
  colorMode,
}: {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
  colorMode: GraphColorMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation<GraphNodeDatum, GraphEdgeDatum> | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);
  const nodesRef = useRef<GraphNodeDatum[]>([]);
  const edgesRef = useRef<GraphEdgeDatum[]>([]);
  const selectedNodeIdRef = useRef<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragNodeRef = useRef<GraphNodeDatum | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 800, height: 520 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const nodeById = useMemo(
    () => new Map(inputNodes.map((node) => [node.id, node])),
    [inputNodes]
  );

  const effectiveColorMode = useMemo<Exclude<GraphColorMode, "auto">>(() => {
    if (colorMode !== "auto") return colorMode;

    const knownTypes = new Set(
      inputNodes
        .map((node) => node.agentType)
        .filter((type): type is string => Boolean(type && AGENT_TYPE_COLORS[type]))
    );
    if (knownTypes.size >= 2) return "agentType";

    const communities = new Set(
      inputNodes
        .map((node) => node.communityLabel)
        .filter((label): label is number => label != null)
    );
    if (communities.size >= 2) return "community";

    return "autonomy";
  }, [colorMode, inputNodes]);

  const dominantLabeledNodeIds = useMemo(() => {
    return new Set(
      [...inputNodes]
        .sort((a, b) => {
          const interactionDiff = b.interactionWeight - a.interactionWeight;
          if (interactionDiff !== 0) return interactionDiff;
          const influenceDiff = (b.influenceScore ?? 0) - (a.influenceScore ?? 0);
          if (influenceDiff !== 0) return influenceDiff;
          return a.displayName.localeCompare(b.displayName);
        })
        .slice(0, 10)
        .map((node) => node.id)
    );
  }, [inputNodes]);

  const topConnectionsByNode = useMemo(() => {
    const adjacency = new Map<string, Array<{ nodeId: string; weight: number; count: number }>>();

    for (const edge of inputEdges) {
      const source = edge.source;
      const target = edge.target;

      if (!adjacency.has(source)) adjacency.set(source, []);
      if (!adjacency.has(target)) adjacency.set(target, []);

      adjacency.get(source)?.push({ nodeId: target, weight: edge.weight, count: edge.count });
      adjacency.get(target)?.push({ nodeId: source, weight: edge.weight, count: edge.count });
    }

    for (const neighbors of adjacency.values()) {
      neighbors.sort((a, b) => {
        const weightDiff = b.weight - a.weight;
        if (weightDiff !== 0) return weightDiff;
        return b.count - a.count;
      });
    }

    return adjacency;
  }, [inputEdges]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const hoveredNode = hoveredNodeId ? nodeById.get(hoveredNodeId) ?? null : null;

  const presentAgentTypes = useMemo(() => {
    const known = new Set<string>();
    for (const node of inputNodes) {
      if (node.agentType && AGENT_TYPE_COLORS[node.agentType]) {
        known.add(node.agentType);
      }
    }
    return [...known].sort((a, b) => a.localeCompare(b));
  }, [inputNodes]);

  const communityLegend = useMemo(() => {
    const counts = new Map<number, number>();
    for (const node of inputNodes) {
      if (node.communityLabel == null) continue;
      counts.set(node.communityLabel, (counts.get(node.communityLabel) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [inputNodes]);

  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;

    const measure = () => {
      setDimensions({
        width: Math.max(320, container.clientWidth),
        height: Math.max(200, container.clientHeight || Math.min(620, Math.round(container.clientWidth * 0.65))),
      });
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => measure());
      observer.observe(container);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    viewRef.current = view;
    redrawRef.current();
  }, [view]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    redrawRef.current();
  }, [selectedNodeId]);

  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId;
    redrawRef.current();
  }, [hoveredNodeId]);

  useEffect(() => {
    redrawRef.current();
  }, [effectiveColorMode, dominantLabeledNodeIds]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!nodeById.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodeById, selectedNodeId]);

  useEffect(() => {
    if (!canvasRef.current || inputNodes.length === 0) {
      simulationRef.current?.stop();
      simulationRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nodes: GraphNodeDatum[] = inputNodes.map((node) => ({ ...node }));
    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const edges: GraphEdgeDatum[] = inputEdges
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: Number(edge.weight) || 0,
        count: Number(edge.count) || 0,
      }))
      .filter((edge) => {
        if (edge.source === edge.target) return false;
        return nodeLookup.has(edge.source as string) && nodeLookup.has(edge.target as string);
      });

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const getNodeRadius = (node: GraphNodeDatum): number => {
      const influence = clamp(node.influenceScore ?? 0, 0, 1);
      const interaction = clamp(Math.log1p(node.interactionCount || 0) / 4, 0, 1);
      return 5 + influence * 10 + interaction * 9;
    };

    const getNodeColor = (node: GraphNodeDatum): string => {
      if (effectiveColorMode === "agentType") {
        return AGENT_TYPE_COLORS[node.agentType || "lurker"] || "#64748b";
      }
      if (effectiveColorMode === "community") {
        return getCommunityColor(node.communityLabel);
      }
      return getAutonomyColor(node.autonomyScore);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const selectedId = selectedNodeIdRef.current;
      const hoveredId = hoveredNodeIdRef.current;

      const { x: viewX, y: viewY, scale } = viewRef.current;
      ctx.save();
      ctx.translate(viewX, viewY);
      ctx.scale(scale, scale);

      for (const edge of edges) {
        const source = edge.source as GraphNodeDatum;
        const target = edge.target as GraphNodeDatum;
        if (source.x == null || source.y == null || target.x == null || target.y == null) continue;

        const sourceId = source.id;
        const targetId = target.id;
        const isSelectedEdge =
          selectedId != null && (sourceId === selectedId || targetId === selectedId);

        const baseWidth = clamp(edge.weight / 6, 0.5, 3.5);
        ctx.strokeStyle = isSelectedEdge ? "rgba(244, 244, 245, 0.7)" : "rgba(113, 113, 122, 0.28)";
        ctx.lineWidth = (isSelectedEdge ? baseWidth * 1.4 : baseWidth) / Math.sqrt(scale);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;

        const nodeId = node.id;
        const radius = getNodeRadius(node);
        const color = getNodeColor(node);
        const isSelected = nodeId === selectedId;
        const isHovered = nodeId === hoveredId;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.lineWidth = (isSelected ? 2.8 : isHovered ? 2 : 1) / Math.sqrt(scale);
        ctx.strokeStyle = isSelected
          ? "rgba(250, 250, 250, 0.95)"
          : isHovered
            ? "rgba(228, 228, 231, 0.75)"
            : "rgba(15, 23, 42, 0.7)";
        ctx.stroke();

        if (dominantLabeledNodeIds.has(nodeId) || isSelected || isHovered) {
          const label =
            node.displayName.length > 16
              ? `${node.displayName.slice(0, 16)}...`
              : node.displayName;

          ctx.font = `${Math.max(10, Math.round(11 / Math.sqrt(scale)))}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(228, 228, 231, 0.96)";
          ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
          ctx.lineWidth = 2 / Math.sqrt(scale);
          ctx.strokeText(label, node.x, node.y + radius + 6);
          ctx.fillText(label, node.x, node.y + radius + 6);
        }
      }

      ctx.restore();
    };

    redrawRef.current = draw;

    const simulation = forceSimulation<GraphNodeDatum>(nodes)
      .force(
        "link",
        forceLink<GraphNodeDatum, GraphEdgeDatum>(edges)
          .id((node) => node.id)
          .distance((edge) => {
            const weight = Number(edge.weight) || 0;
            return clamp(120 - weight * 10, 46, 125);
          })
          .strength((edge) => clamp((Number(edge.weight) || 0) / 18, 0.08, 0.6))
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<GraphNodeDatum>().radius((node) => getNodeRadius(node) + 6)
      )
      .alpha(1)
      .alphaDecay(0.03)
      .velocityDecay(0.26);

    simulation.on("tick", draw);
    simulationRef.current = simulation;
    draw();

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [dimensions, inputNodes, inputEdges, effectiveColorMode, dominantLabeledNodeIds]);

  const findNodeAtPosition = (screenX: number, screenY: number): GraphNodeDatum | null => {
    const { x: offsetX, y: offsetY, scale } = viewRef.current;
    const graphX = (screenX - offsetX) / scale;
    const graphY = (screenY - offsetY) / scale;

    let bestNode: GraphNodeDatum | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;

      const influence = clamp(node.influenceScore ?? 0, 0, 1);
      const interaction = clamp(Math.log1p(node.interactionCount || 0) / 4, 0, 1);
      const radius = 5 + influence * 10 + interaction * 9;
      const dx = graphX - node.x;
      const dy = graphY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= radius + 4 && distance < bestDistance) {
        bestNode = node;
        bestDistance = distance;
      }
    }

    return bestNode;
  };

  const getRelativePointer = (
    event: ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const relative = getRelativePointer(event);
    if (!relative) return;

    pointerStartRef.current = relative;
    pointerMovedRef.current = false;

    const hitNode = findNodeAtPosition(relative.x, relative.y);

    if (hitNode) {
      dragNodeRef.current = hitNode;
      hitNode.fx = hitNode.x ?? 0;
      hitNode.fy = hitNode.y ?? 0;
      simulationRef.current?.alphaTarget(0.25).restart();
      canvasRef.current?.setPointerCapture(event.pointerId);
      canvasRef.current!.style.cursor = "grabbing";
    } else {
      panRef.current = {
        startX: relative.x,
        startY: relative.y,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      };
      canvasRef.current?.setPointerCapture(event.pointerId);
      canvasRef.current!.style.cursor = "grabbing";
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const relative = getRelativePointer(event);
    if (!relative) return;

    if (pointerStartRef.current) {
      const deltaX = relative.x - pointerStartRef.current.x;
      const deltaY = relative.y - pointerStartRef.current.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
        pointerMovedRef.current = true;
      }
    }

    const dragNode = dragNodeRef.current;
    if (dragNode) {
      const { x: offsetX, y: offsetY, scale } = viewRef.current;
      dragNode.fx = (relative.x - offsetX) / scale;
      dragNode.fy = (relative.y - offsetY) / scale;
      redrawRef.current();
      return;
    }

    if (panRef.current) {
      const nextX = panRef.current.originX + (relative.x - panRef.current.startX);
      const nextY = panRef.current.originY + (relative.y - panRef.current.startY);
      setView((current) => ({ ...current, x: nextX, y: nextY }));
      return;
    }

    const hitNode = findNodeAtPosition(relative.x, relative.y);
    const nextHoverId = hitNode?.id ?? null;

    setHoveredNodeId((current) => (current === nextHoverId ? current : nextHoverId));
    setHoverPosition(hitNode ? relative : null);

    if (canvasRef.current) {
      canvasRef.current.style.cursor = hitNode ? "pointer" : "grab";
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    const relative = getRelativePointer(event);

    const dragNode = dragNodeRef.current;
    if (dragNode) {
      dragNode.fx = null;
      dragNode.fy = null;
      dragNodeRef.current = null;
      simulationRef.current?.alphaTarget(0);
    }

    const wasPanning = panRef.current != null;
    panRef.current = null;

    if (!pointerMovedRef.current && relative) {
      const hitNode = findNodeAtPosition(relative.x, relative.y);
      setSelectedNodeId(hitNode?.id ?? null);
    } else if (!dragNode && wasPanning) {
      redrawRef.current();
    }

    pointerStartRef.current = null;
    pointerMovedRef.current = false;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = "grab";
    }
  };

  const handlePointerLeave = () => {
    if (!dragNodeRef.current && !panRef.current) {
      setHoveredNodeId(null);
      setHoverPosition(null);
    }
    if (canvasRef.current && !dragNodeRef.current) {
      canvasRef.current.style.cursor = "grab";
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const relative = getRelativePointer(event);
    if (!relative) return;

    const nextScale = clamp(
      viewRef.current.scale * Math.exp(-event.deltaY * 0.0014),
      MIN_ZOOM,
      MAX_ZOOM
    );

    if (nextScale === viewRef.current.scale) return;

    setView((current) => {
      const graphX = (relative.x - current.x) / current.scale;
      const graphY = (relative.y - current.y) / current.scale;

      return {
        scale: nextScale,
        x: relative.x - graphX * nextScale,
        y: relative.y - graphY * nextScale,
      };
    });
  };

  const resetView = () => {
    setView({ x: 0, y: 0, scale: 1 });
    simulationRef.current?.alpha(0.45).restart();
  };

  if (inputNodes.length === 0 || inputEdges.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
        No interaction network available for this filter window
      </div>
    );
  }

  const selectedConnections = selectedNodeId
    ? (topConnectionsByNode.get(selectedNodeId) ?? []).slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
        <div>
          Drag nodes to inspect local neighborhoods, drag background to pan, scroll to zoom.
        </div>
        <div className="flex items-center gap-2">
          <span>Zoom {view.scale.toFixed(2)}x</span>
          <Button size="xs" variant="outline" className="border-zinc-700" onClick={resetView}>
            Reset view
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
          />

          {hoveredNode && hoverPosition && (
            <div
              className="pointer-events-none absolute z-10 min-w-44 rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-lg"
              style={{
                left: Math.min(hoverPosition.x + 12, dimensions.width - 200),
                top: Math.max(hoverPosition.y + 12, 8),
              }}
            >
              <div className="font-semibold text-zinc-100">{hoveredNode.displayName}</div>
              <div className="mt-1 text-zinc-400">type: {formatType(hoveredNode.agentType)}</div>
              <div className="text-zinc-400">
                autonomy: {hoveredNode.autonomyScore != null ? hoveredNode.autonomyScore.toFixed(2) : "n/a"}
              </div>
              <div className="text-zinc-400">interaction weight: {hoveredNode.interactionWeight.toFixed(1)}</div>
            </div>
          )}
        </div>

        <aside className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Node Inspector</h3>
          {selectedNode ? (
            <div className="space-y-3 text-xs text-zinc-300">
              <div>
                <div className="text-sm font-medium text-zinc-100">{selectedNode.displayName}</div>
                <div className="mt-1 text-zinc-400">type: {formatType(selectedNode.agentType)}</div>
                <div className="text-zinc-400">
                  influence: {selectedNode.influenceScore != null ? selectedNode.influenceScore.toFixed(2) : "n/a"}
                </div>
                <div className="text-zinc-400">
                  autonomy: {selectedNode.autonomyScore != null ? selectedNode.autonomyScore.toFixed(2) : "n/a"}
                </div>
                <div className="text-zinc-400">interaction count: {selectedNode.interactionCount}</div>
              </div>

              <div>
                <div className="mb-1 text-zinc-200">Top connected agents</div>
                {selectedConnections.length === 0 ? (
                  <div className="text-zinc-500">No direct connections in this slice.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {selectedConnections.map((connection) => {
                      const neighbor = nodeById.get(connection.nodeId);
                      if (!neighbor) return null;
                      return (
                        <li key={`${selectedNode.id}-${connection.nodeId}`}>
                          <button
                            type="button"
                            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-left text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                            onClick={() => setSelectedNodeId(neighbor.id)}
                          >
                            <div className="truncate text-zinc-100">{neighbor.displayName}</div>
                            <div className="text-[11px] text-zinc-500">
                              weight {connection.weight.toFixed(1)} | {connection.count} interactions
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <Button
                size="xs"
                variant="outline"
                className="border-zinc-700"
                asChild
              >
                <Link href={`/agents/${selectedNode.id}`}>Open agent detail</Link>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Click a node or a connection card to inspect relationship context.
            </p>
          )}
        </aside>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Color key ({effectiveColorMode})
        </div>

        {effectiveColorMode === "agentType" && (
          <div className="flex flex-wrap gap-3">
            {(presentAgentTypes.length > 0 ? presentAgentTypes : Object.keys(AGENT_TYPE_COLORS)).map((type) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AGENT_TYPE_COLORS[type] }} />
                {formatType(type)}
              </div>
            ))}
          </div>
        )}

        {effectiveColorMode === "community" && (
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            {communityLegend.length === 0 ? (
              <span>No community labels available in this slice.</span>
            ) : (
              communityLegend.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getCommunityColor(entry.label) }}
                  />
                  community {entry.label} ({entry.count})
                </div>
              ))
            )}
          </div>
        )}

        {effectiveColorMode === "autonomy" && (
          <div className="space-y-2 text-xs text-zinc-400">
            <div
              className="h-2 w-full rounded"
              style={{
                background:
                  "linear-gradient(90deg, hsl(8 72% 44%) 0%, hsl(72 72% 44%) 50%, hsl(138 72% 44%) 100%)",
              }}
            />
            <div className="flex justify-between">
              <span>low autonomy</span>
              <span>high autonomy</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
