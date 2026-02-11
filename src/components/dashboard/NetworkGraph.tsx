"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  displayName: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  agentType: string | null;
  communityLabel: number | null;
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
  weight: number;
  count: number;
}

const AGENT_TYPE_COLORS: Record<string, string> = {
  content_creator: "#10b981",
  commenter: "#3b82f6",
  active: "#f59e0b",
  conversationalist: "#8b5cf6",
  rising: "#ec4899",
  bot_farm: "#ef4444",
  lurker: "#6b7280",
};

export function NetworkGraph({
  nodes: initialNodes,
  edges: initialEdges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (container) {
      setDimensions({
        width: container.clientWidth,
        height: Math.max(400, Math.min(container.clientWidth * 0.6, 600)),
      });
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current || initialNodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;
    canvas.width = width * 2; // retina
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(2, 2);

    // Clone nodes and edges for d3 mutation
    const nodes: GraphNode[] = initialNodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = initialEdges
      .filter((e) => nodes.find((n) => n.id === e.source) && nodes.find((n) => n.id === e.target))
      .map((e) => ({ ...e }));

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(80)
          .strength((d) => Math.min(Number(d.weight) / 20, 0.5))
      )
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide().radius((d: SimulationNodeDatum) => getNodeRadius(d as GraphNode) + 4));

    function getNodeRadius(node: GraphNode): number {
      return 4 + (node.influenceScore || 0) * 16;
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      // Draw edges
      ctx!.strokeStyle = "rgba(113, 113, 122, 0.3)";
      for (const edge of edges) {
        const source = edge.source as unknown as GraphNode;
        const target = edge.target as unknown as GraphNode;
        if (source.x == null || target.x == null) continue;

        ctx!.lineWidth = Math.min(Number(edge.weight) / 5, 3);
        ctx!.beginPath();
        ctx!.moveTo(source.x, source.y!);
        ctx!.lineTo(target.x, target.y!);
        ctx!.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        if (node.x == null) continue;

        const radius = getNodeRadius(node);
        const color = AGENT_TYPE_COLORS[node.agentType || "lurker"] || "#6b7280";

        ctx!.beginPath();
        ctx!.arc(node.x, node.y!, radius, 0, 2 * Math.PI);
        ctx!.fillStyle = color;
        ctx!.fill();
        ctx!.strokeStyle = "rgba(0,0,0,0.3)";
        ctx!.lineWidth = 1;
        ctx!.stroke();

        // Draw label for influential nodes
        if ((node.influenceScore || 0) > 0.3) {
          ctx!.fillStyle = "#d4d4d8";
          ctx!.font = "10px system-ui";
          ctx!.textAlign = "center";
          ctx!.fillText(
            node.displayName.length > 12
              ? node.displayName.slice(0, 12) + "\u2026"
              : node.displayName,
            node.x,
            node.y! + radius + 12
          );
        }
      }
    }

    simulation.on("tick", draw);

    return () => {
      simulation.stop();
    };
  }, [initialNodes, initialEdges, dimensions]);

  if (initialNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        No interaction data available for network graph
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <canvas ref={canvasRef} className="rounded-lg bg-zinc-950" />
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(AGENT_TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
