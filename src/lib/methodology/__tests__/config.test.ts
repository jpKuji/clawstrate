import { describe, expect, it } from "vitest";
import {
  CURRENT_RUNTIME_CADENCE_ROWS,
  GLOBAL_METHODOLOGY_CONFIG,
  LOOKBACK_WINDOW_ROWS,
  getEnabledSourceMethodologies,
  getIntegratedSourceMethodologies,
} from "@/lib/methodology/config";
import {
  PIPELINE_LOOKBACK_WINDOWS,
  PIPELINE_RUNTIME_CADENCE,
  PIPELINE_STAGE_ORDER,
} from "@/lib/pipeline/metadata";
import { getSourceAdapters } from "@/lib/sources";

describe("methodology config integrity", () => {
  it("keeps methodology stage order aligned with canonical pipeline stage order", () => {
    expect(GLOBAL_METHODOLOGY_CONFIG.stages.map((stage) => stage.id)).toEqual([
      ...PIPELINE_STAGE_ORDER,
    ]);
  });

  it("uses canonical runtime cadence metadata in rendered cadence rows", () => {
    const orchestratedRow = CURRENT_RUNTIME_CADENCE_ROWS.find(
      (row) => row.process === "Orchestrated pipeline trigger"
    );
    const weeklyRow = CURRENT_RUNTIME_CADENCE_ROWS.find(
      (row) => row.process === "Weekly executive briefing trigger"
    );

    expect(orchestratedRow?.cadence).toBe(
      PIPELINE_RUNTIME_CADENCE.orchestratedCron
    );
    expect(orchestratedRow?.route).toBe(
      PIPELINE_RUNTIME_CADENCE.orchestratedRoute
    );
    expect(weeklyRow?.cadence).toBe(PIPELINE_RUNTIME_CADENCE.weeklyExecutiveCron);
    expect(weeklyRow?.route).toBe(PIPELINE_RUNTIME_CADENCE.weeklyExecutiveRoute);
  });

  it("keeps lookback rows aligned with canonical lookback metadata", () => {
    expect(LOOKBACK_WINDOW_ROWS).toEqual(PIPELINE_LOOKBACK_WINDOWS);
  });
});

describe("source methodology registry sync", () => {
  it("ensures every registered source adapter exposes methodology metadata", () => {
    const adapters = getSourceAdapters();
    for (const adapter of adapters) {
      expect(adapter.methodology).toBeDefined();
      expect(adapter.methodology.id).toBe(adapter.id);
      expect(adapter.methodology.displayName).toBe(adapter.displayName);
      expect(adapter.methodology.coverageSummary.length).toBeGreaterThan(0);
      expect(adapter.methodology.ingestionBehavior.length).toBeGreaterThan(0);
    }
  });

  it("keeps enabled methodology tabs aligned with enabled adapters", () => {
    const enabledAdapterIds = getSourceAdapters()
      .filter((adapter) => adapter.isEnabled())
      .map((adapter) => adapter.id)
      .sort();
    const enabledMethodologyIds = getEnabledSourceMethodologies()
      .map((source) => source.id)
      .sort();

    expect(enabledMethodologyIds).toEqual(enabledAdapterIds);
  });

  it("captures Moltbook comment inclusion threshold from implementation behavior", () => {
    const moltbook = getIntegratedSourceMethodologies().find(
      (source) => source.id === "moltbook"
    );
    expect(moltbook).toBeDefined();
    expect(
      moltbook!.sourceSpecificMetrics.some(
        (metric) =>
          metric.label === "Comment inclusion threshold" &&
          metric.value.includes("comment_count > 0")
      )
    ).toBe(true);
  });
});
