"use client";

import { useEffect, useMemo, useState } from "react";
import { NetworkGraph } from "@/components/dashboard/NetworkGraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GraphApiResponse, GraphColorMode } from "@/lib/network/types";
import { formatSourceLabel } from "@/lib/sources/display";

const WINDOW_OPTIONS = [7, 14, 30, 60] as const;
const MAX_NODE_OPTIONS = [30, 50, 80, 120] as const;

const EMPTY_DATA: GraphApiResponse = {
  nodes: [],
  edges: [],
  availableSources: ["all"],
  meta: {
    source: "all",
    windowDays: 30,
    maxNodes: 50,
    totalNodes: 0,
    totalEdges: 0,
  },
};

export function NetworkExplorer({
  initialData,
}: {
  initialData: GraphApiResponse | null;
}) {
  const [data, setData] = useState<GraphApiResponse>(initialData ?? EMPTY_DATA);
  const [source, setSource] = useState(initialData?.meta.source ?? "all");
  const [windowDays, setWindowDays] = useState<number>(initialData?.meta.windowDays ?? 30);
  const [maxNodes, setMaxNodes] = useState<number>(initialData?.meta.maxNodes ?? 50);
  const [colorMode, setColorMode] = useState<GraphColorMode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const availableSources = useMemo(() => {
    const sourceSet = new Set<string>(["all", ...(data.availableSources || [])]);
    return [...sourceSet];
  }, [data.availableSources]);

  useEffect(() => {
    if (!availableSources.includes(source)) {
      setSource("all");
    }
  }, [availableSources, source]);

  useEffect(() => {
    const controller = new AbortController();

    const refresh = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          source,
          windowDays: String(windowDays),
          maxNodes: String(maxNodes),
        });

        const response = await fetch(`/api/v1/graph?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Graph request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as GraphApiResponse;
        setData(payload);
      } catch (errorValue) {
        if (controller.signal.aborted) return;
        const message =
          errorValue instanceof Error
            ? errorValue.message
            : "Unable to refresh network data";
        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void refresh();
    return () => controller.abort();
  }, [source, windowDays, maxNodes, refreshTick]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-zinc-400">
            <span className="mb-1 block">Source</span>
            <select
              aria-label="Source"
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              {availableSources.map((option) => (
                <option key={option} value={option}>
                  {formatSourceLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-zinc-400">
            <span className="mb-1 block">Window (days)</span>
            <select
              aria-label="Window"
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value))}
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} days
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-zinc-400">
            <span className="mb-1 block">Max nodes</span>
            <select
              aria-label="Max nodes"
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              value={maxNodes}
              onChange={(event) => setMaxNodes(Number(event.target.value))}
            >
              {MAX_NODE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-zinc-400">
            <span className="mb-1 block">Color mode</span>
            <select
              aria-label="Color mode"
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              value={colorMode}
              onChange={(event) => setColorMode(event.target.value as GraphColorMode)}
            >
              <option value="auto">Auto</option>
              <option value="agentType">Agent type</option>
              <option value="community">Community</option>
              <option value="autonomy">Autonomy</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {data.meta.totalNodes} nodes
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {data.meta.totalEdges} edges
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            source: {formatSourceLabel(data.meta.source)}
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            window: {data.meta.windowDays}d
          </Badge>
          {loading && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              refreshing
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          <div className="font-medium">Unable to refresh network data</div>
          <div className="mt-1 text-xs text-red-200/80">{error}</div>
          <div className="mt-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="border-red-800/80 text-red-100 hover:bg-red-950"
              onClick={() => {
                setRefreshTick((value) => value + 1);
              }}
            >
              Retry now
            </Button>
          </div>
        </div>
      )}

      <NetworkGraph nodes={data.nodes} edges={data.edges} colorMode={colorMode} />
    </div>
  );
}
