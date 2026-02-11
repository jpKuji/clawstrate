"use client";

import { useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

type LayoutStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const noopStorage: LayoutStorage = {
  getItem: () => null,
  setItem: () => {},
};

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-1">
      <div className="w-px h-full bg-zinc-800 group-hover:bg-[var(--accent-cyan)] group-data-[resize-handle-active]:bg-[var(--accent-cyan)] transition-colors" />
    </Separator>
  );
}

interface ResizableDashboardGridProps {
  agentsPanel: React.ReactNode;
  topicsPanel: React.ReactNode;
  networkPanel: React.ReactNode;
  briefingPanel: React.ReactNode;
  activityPanel: React.ReactNode;
}

function ResizableDesktop({
  agentsPanel,
  topicsPanel,
  networkPanel,
  briefingPanel,
  activityPanel,
}: ResizableDashboardGridProps) {
  const [storage, setStorage] = useState<LayoutStorage>(noopStorage);

  useEffect(() => {
    setStorage(localStorage);
  }, []);

  const row1Layout = useDefaultLayout({
    id: "dashboard-row-1",
    panelIds: ["agents", "topics"],
    storage,
  });

  const row2Layout = useDefaultLayout({
    id: "dashboard-row-2",
    panelIds: ["network", "briefing"],
    storage,
  });

  return (
    <div className="hidden lg:flex lg:flex-col lg:flex-1">
      {/* Row 1: Agents | Topics */}
      <Group
        orientation="horizontal"
        id="dashboard-row-1"
        defaultLayout={row1Layout.defaultLayout}
      >
        <Panel id="agents" defaultSize={50} minSize={30}>
          {agentsPanel}
        </Panel>
        <ResizeHandle />
        <Panel id="topics" defaultSize={50} minSize={30}>
          {topicsPanel}
        </Panel>
      </Group>

      {/* Row 2: Network | Briefing Preview */}
      <Group
        orientation="horizontal"
        id="dashboard-row-2"
        defaultLayout={row2Layout.defaultLayout}
      >
        <Panel id="network" defaultSize={50} minSize={30}>
          {networkPanel}
        </Panel>
        <ResizeHandle />
        <Panel id="briefing" defaultSize={50} minSize={30}>
          {briefingPanel}
        </Panel>
      </Group>

      {/* Row 3: Activity Feed (full width, not resizable) */}
      <div>{activityPanel}</div>
    </div>
  );
}

export function ResizableDashboardGrid(props: ResizableDashboardGridProps) {
  const { agentsPanel, topicsPanel, networkPanel, briefingPanel, activityPanel } = props;

  return (
    <div className="flex-1 flex flex-col">
      {/* Desktop: resizable panels */}
      <ResizableDesktop {...props} />

      {/* Mobile: simple vertical stack */}
      <div className="lg:hidden flex flex-col">
        {agentsPanel}
        {topicsPanel}
        <div className="hidden md:block">{networkPanel}</div>
        {briefingPanel}
        {activityPanel}
      </div>
    </div>
  );
}
