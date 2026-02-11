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

function HorizontalResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center h-1">
      <div className="h-px w-full bg-zinc-800 group-hover:bg-[var(--accent-cyan)] group-data-[resize-handle-active]:bg-[var(--accent-cyan)] transition-colors" />
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

  const rowsLayout = useDefaultLayout({
    id: "dashboard-rows",
    panelIds: ["row1", "row2"],
    storage,
  });

  return (
    <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:overflow-hidden">
      <Group
        orientation="vertical"
        id="dashboard-rows"
        defaultLayout={rowsLayout.defaultLayout}
      >
        <Panel id="row1" defaultSize={50} minSize={25}>
          {/* Row 1: Agents | Topics */}
          <Group
            orientation="horizontal"
            id="dashboard-row-1"
            defaultLayout={row1Layout.defaultLayout}
          >
            <Panel id="agents" defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto">{agentsPanel}</div>
            </Panel>
            <ResizeHandle />
            <Panel id="topics" defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto">{topicsPanel}</div>
            </Panel>
          </Group>
        </Panel>
        <HorizontalResizeHandle />
        <Panel id="row2" defaultSize={50} minSize={25}>
          {/* Row 2: Network | Briefing Preview */}
          <Group
            orientation="horizontal"
            id="dashboard-row-2"
            defaultLayout={row2Layout.defaultLayout}
          >
            <Panel id="network" defaultSize={50} minSize={30}>
              <div className="h-full overflow-hidden">{networkPanel}</div>
            </Panel>
            <ResizeHandle />
            <Panel id="briefing" defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto">{briefingPanel}</div>
            </Panel>
          </Group>
        </Panel>
      </Group>

      {/* Row 3: Activity Feed (full width, capped height) */}
      <div className="shrink-0 max-h-[160px] overflow-y-auto">{activityPanel}</div>
    </div>
  );
}

export function ResizableDashboardGrid(props: ResizableDashboardGridProps) {
  const { agentsPanel, topicsPanel, networkPanel, briefingPanel, activityPanel } = props;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Desktop: resizable panels */}
      <ResizableDesktop {...props} />

      {/* Mobile: simple vertical stack */}
      <div className="lg:hidden flex flex-col overflow-y-auto">
        {agentsPanel}
        {topicsPanel}
        <div className="hidden md:block">{networkPanel}</div>
        {briefingPanel}
        {activityPanel}
      </div>
    </div>
  );
}
