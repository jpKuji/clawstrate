export type GraphColorMode = "auto" | "agentType" | "community" | "autonomy";

export interface NetworkGraphNode {
  id: string;
  displayName: string;
  influenceScore: number | null;
  autonomyScore: number | null;
  activityScore: number | null;
  agentType: string | null;
  communityLabel: number | null;
  interactionWeight: number;
  interactionCount: number;
}

export interface NetworkGraphEdge {
  source: string;
  target: string;
  weight: number;
  count: number;
}

export interface GraphApiMeta {
  source: string;
  windowDays: number;
  maxNodes: number;
  totalNodes: number;
  totalEdges: number;
}

export interface GraphApiResponse {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
  availableSources: string[];
  meta: GraphApiMeta;
}
