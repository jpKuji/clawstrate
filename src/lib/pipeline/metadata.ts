export const PIPELINE_STAGE_ORDER = [
  "ingest",
  "enrich",
  "analyze",
  "aggregate",
  "coordination",
  "briefing",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];

export const PIPELINE_RUNTIME_CADENCE = {
  scheduler: "QStash",
  orchestratedCron: "*/30 * * * *",
  orchestratedRoute: "/api/cron/pipeline",
  orchestratedBehavior:
    "The orchestrated route always runs ingest + enrich. When PIPELINE_SPLIT_JOBS=true, heavy stages are delegated to dedicated schedules.",
  analyzeCron: "5 */2 * * *",
  analyzeRoute: "/api/cron/analyze",
  aggregateCron: "15 */2 * * *",
  aggregateRoute: "/api/cron/aggregate",
  coordinationCron: "25 */2 * * *",
  coordinationRoute: "/api/cron/coordination",
  briefingCron: "0 */6 * * *",
  briefingRoute: "/api/cron/briefing",
  weeklyExecutiveCron: "0 9 * * 1",
  weeklyExecutiveRoute: "/api/cron/briefing-weekly",
  weeklyExecutiveBehavior:
    "Weekly executive briefing generation runs separately from the core orchestration pipeline.",
  onchainCron: "*/10 * * * *",
  onchainRoute: "/api/cron/onchain",
  onchainBackfillCron: "5 * * * *",
  onchainBackfillRoute: "/api/cron/onchain-backfill",
} as const;

export const PIPELINE_LOOKBACK_WINDOWS = [
  {
    area: "Influence score (PageRank)",
    window: "7 days",
    details: "Computed from interaction graph edges in analyze stage.",
  },
  {
    area: "Activity score",
    window: "24 hours",
    details: "Quality-weighted activity over substantive, non-substantive, and unenriched actions.",
  },
  {
    area: "Temporal patterns",
    window: "14 days (plus 7-day burst sub-window)",
    details: "Posting regularity, peak hour, and burst count.",
  },
  {
    area: "Coordination - temporal clustering",
    window: "24 hours, evaluated in 2-hour buckets",
    details: "Flags low-density interaction clusters around the same topic.",
  },
  {
    area: "Coordination - content similarity",
    window: "7-day UTC-anchored rolling window",
    details: "Jaccard similarity on per-agent topic vectors.",
  },
  {
    area: "Coordination - reply cliques",
    window: "7-day UTC-anchored rolling window",
    details: "Flags groups with >80% internal interaction ratio.",
  },
  {
    area: "Community detection",
    window: "14 days",
    details: "Deterministic label propagation on undirected weighted interaction graph.",
  },
  {
    area: "Dashboard metric deltas",
    window: "Current 24h vs previous 24h",
    details: "Symmetric comparison windows for actions and network averages.",
  },
  {
    area: "Briefing windows",
    window: "6 hours (standard) and 7 days (weekly executive)",
    details: "Narrative generation periods for operational and executive reporting.",
  },
] as const;
