import { getSourceAdapters } from "@/lib/sources";
import {
  PIPELINE_LOOKBACK_WINDOWS,
  PIPELINE_RUNTIME_CADENCE,
  PIPELINE_STAGE_ORDER,
  type PipelineStageName,
} from "@/lib/pipeline/metadata";
import type {
  GlobalMethodologyConfig,
  MethodologySourceView,
  MethodologyStage,
} from "./types";

const STAGE_DETAILS: Record<PipelineStageName, Omit<MethodologyStage, "id">> = {
  ingest: {
    title: "Ingest",
    description:
      "Runs source adapters, normalizes platform payloads into canonical actions, upserts agents/communities/actions, and writes interaction edges.",
  },
  enrich: {
    title: "Enrich",
    description:
      "Classifies actions with Claude Haiku plus deterministic content metrics, then tags topics/entities and persists enrichment artifacts.",
  },
  analyze: {
    title: "Analyze",
    description:
      "Computes influence, autonomy, quality-weighted activity, agent typing, and temporal behavior signals.",
  },
  aggregate: {
    title: "Aggregate",
    description:
      "Builds daily agent/topic stats and idempotent daily topic co-occurrence counts.",
  },
  coordination: {
    title: "Coordination",
    description:
      "Detects temporal clusters, content similarity, reply cliques, and deterministic graph communities with dedupe-safe windows.",
  },
  briefing: {
    title: "Briefing",
    description:
      "Generates structured narratives, validates citations, and stores summaries for operational intelligence consumption.",
  },
};

export const GLOBAL_METHODOLOGY_CONFIG: GlobalMethodologyConfig = {
  title: "Methodology",
  description: "How CLAWSTRATE collects, processes, and scores AI agent behavior",
  intro:
    "CLAWSTRATE uses a split-capable orchestration pipeline to transform raw platform activity into behavioral intelligence. This page is generated from typed methodology metadata to keep documentation aligned with runtime logic.",
  pipelineSummary: PIPELINE_RUNTIME_CADENCE.orchestratedBehavior,
  stages: PIPELINE_STAGE_ORDER.map((id) => ({
    id,
    title: STAGE_DETAILS[id].title,
    description: STAGE_DETAILS[id].description,
  })),
  scoreMetrics: [
    {
      name: "Originality (0-1)",
      description: "Novel framing and idea contribution vs repeated or templated content.",
      bands: [
        { range: "0.0-0.2", meaning: "Restatement/template behavior" },
        { range: "0.2-0.5", meaning: "Basic engagement with limited novelty" },
        { range: "0.5-0.7", meaning: "Moderate original framing" },
        { range: "0.7-1.0", meaning: "High novelty or creative synthesis" },
      ],
    },
    {
      name: "Behavioral independence (0-1)",
      description:
        "Measures initiative and continuity vs purely reactive prompt-response behavior.",
      bands: [
        { range: "0.0-0.2", meaning: "Formulaic or fully reactive behavior" },
        { range: "0.2-0.5", meaning: "Responsive but not agenda-driving" },
        { range: "0.5-0.7", meaning: "Shows independent direction" },
        { range: "0.7-1.0", meaning: "Consistent self-directed contributions" },
      ],
    },
    {
      name: "Coordination signal (0-1)",
      description:
        "Likelihood an action participates in coordinated behavior rather than independent contribution.",
    },
    {
      name: "Autonomy score (backward compatible)",
      description: "Legacy aggregate score retained for compatibility and trend continuity.",
      formula: "(originality + behavioral_independence) / 2",
    },
    {
      name: "Influence score",
      description:
        "PageRank on the interaction graph with quality multipliers from substantive signal.",
    },
    {
      name: "Activity score",
      description: "Recent activity weighted by substantive quality and enrichment status.",
      formula: "min((substantive*1.0 + nonsubstantive*0.3 + unenriched*0.5) / 15, 1.0)",
    },
  ],
  classificationIntro:
    "Agent types are assigned in priority order on each analysis run. First matching rule wins.",
  classificationRules: [
    {
      type: "bot_farm",
      condition: "autonomy < 0.2 AND total actions > 30",
      interpretation: "High-volume, low-autonomy pattern flagged as suspicious.",
    },
    {
      type: "content_creator",
      condition: "total > 50 AND posts > comments * 2",
      interpretation: "Primarily initiates original top-level content.",
    },
    {
      type: "commenter",
      condition: "total > 50 AND comments > posts * 3",
      interpretation: "Primarily engages via comments/replies.",
    },
    {
      type: "conversationalist",
      condition: "total > 50",
      interpretation: "High-volume balanced conversation pattern.",
    },
    {
      type: "active",
      condition: "total > 20",
      interpretation: "Consistent participation below high-volume thresholds.",
    },
    {
      type: "rising",
      condition: "10-20 actions AND first seen < 7 days",
      interpretation: "Newly observed actor with emerging activity.",
    },
    {
      type: "lurker",
      condition: "default fallback",
      interpretation: "Low observed activity in current windows.",
    },
  ],
  coordinationMethods: [
    {
      name: "Temporal clustering",
      definition:
        "Flags >=3 weakly connected agents posting on same topic within 2-hour windows over last 24h.",
    },
    {
      name: "Content similarity",
      definition:
        "Computes Jaccard similarity on topic vectors across a 7-day UTC-anchored window.",
    },
    {
      name: "Reply clique detection",
      definition:
        "Flags groups where internal interactions exceed 80% of observed interaction volume in 7-day UTC-anchored windows.",
    },
  ],
  communityDetectionDescription:
    "Deterministic label propagation runs on the 14-day undirected weighted interaction graph and assigns stable community labels.",
  temporalPatternDescriptions: [
    "Posting regularity: standard deviation of daily action counts over 14 days.",
    "Peak hour UTC: most frequent activity hour across daily rollups.",
    "Burst count (7d): days where activity exceeds 3x the 14-day average.",
  ],
  topicMetricDescriptions: [
    "Velocity: actions in trailing 24h divided by 24 (actions/hour).",
    "Agent count: distinct participating agents per topic.",
    "Co-occurrence: daily idempotent topic-pair counts from multi-tagged actions.",
  ],
  briefingDescriptions: [
    "Operational briefings are generated as structured JSON with validated citations.",
    "Standard briefing window is 6 hours; weekly executive briefings summarize 7-day behavior.",
    "Briefings include detected coordination signals, top topics/agents, and trend context.",
  ],
  networkGraphDescription:
    "Network view renders top influence agents and weighted interaction edges, with community labels available for segmentation.",
  freshnessRows: [
    {
      data: "Orchestrated ingest + enrich",
      updateFrequency: `Every 30 minutes (${PIPELINE_RUNTIME_CADENCE.orchestratedCron})`,
      lookbackWindow: "Continuous source polling and enrichment windows",
    },
    {
      data: "Analyze stage",
      updateFrequency: `Every 2 hours (${PIPELINE_RUNTIME_CADENCE.analyzeCron})`,
      lookbackWindow: "Incremental cursor + 14-day behavior windows",
    },
    {
      data: "Aggregate stage",
      updateFrequency: `Every 2 hours (${PIPELINE_RUNTIME_CADENCE.aggregateCron})`,
      lookbackWindow: "Impacted UTC days from incremental cursor deltas",
    },
    {
      data: "Coordination stage",
      updateFrequency: `Every 2 hours (${PIPELINE_RUNTIME_CADENCE.coordinationCron})`,
      lookbackWindow: "Incremental cursor + 24h/7d detection windows",
    },
    {
      data: "Operational briefing",
      updateFrequency: `Every 6 hours (${PIPELINE_RUNTIME_CADENCE.briefingCron})`,
      lookbackWindow: "Previous 6 hours",
    },
    {
      data: "Weekly executive briefing",
      updateFrequency: `Weekly (${PIPELINE_RUNTIME_CADENCE.weeklyExecutiveCron})`,
      lookbackWindow: "Previous 7 days",
    },
    {
      data: "Dashboard API cache",
      updateFrequency: "60-120 seconds",
      lookbackWindow: "Invalidated on successful pipeline completion",
    },
  ],
};

export function getIntegratedSourceMethodologies(): MethodologySourceView[] {
  const adapterMethodologies = getSourceAdapters().map((adapter) => ({
    ...adapter.methodology,
    isEnabled: adapter.isEnabled(),
  }));

  const onchainMethodology: MethodologySourceView = {
    id: "onchain",
    displayName: "EVM Onchain",
    status: "beta",
    coverageSummary:
      "Ingests ERC-8004 and related EVM standards, derives economic-intent topics, and tracks cross-chain agent activity.",
    ingestionBehavior: [
      `Runs dedicated onchain ingestion on ${PIPELINE_RUNTIME_CADENCE.onchainCron} (${PIPELINE_RUNTIME_CADENCE.onchainRoute}).`,
      "Persists canonical event logs and protocol-native entities (agents, feedback, validations, account abstraction events).",
      "Assigns deterministic economic topics per event family and selectively applies LLM refinement for high-value metadata-rich events.",
      "Stores event-to-agent and event-to-topic joins for cross-source agent/topic surfaces.",
    ],
    identityModel:
      "Primary identity is protocol-native (`agentKey = chainId:registry:agentId`). Wallet and metadata links are attached when present; cross-source merges are API-level today.",
    knownLimitations: [
      "Not every onchain event resolves to a known agent identity (especially infra-only events).",
      "Topic quality depends on decoded payload completeness; sparse logs fall back to deterministic taxonomy.",
      "Onchain scoring is source-aware and not directly equivalent to forum engagement scoring.",
    ],
    sourceSpecificMetrics: [
      { label: "Primary standards", value: "ERC-8004, ERC-6551, ERC-4337, ERC-8001, ERC-7007, ERC-7579, EIP-7702" },
      { label: "Ingest cadence", value: `${PIPELINE_RUNTIME_CADENCE.onchainCron} (${PIPELINE_RUNTIME_CADENCE.onchainRoute})` },
      { label: "Backfill cadence", value: `${PIPELINE_RUNTIME_CADENCE.onchainBackfillCron} (${PIPELINE_RUNTIME_CADENCE.onchainBackfillRoute})` },
      { label: "Topic strategy", value: "Deterministic economic taxonomy + selective LLM refinement" },
    ],
    isEnabled: true,
  };

  return [...adapterMethodologies, onchainMethodology];
}

export function getEnabledSourceMethodologies(): MethodologySourceView[] {
  return getIntegratedSourceMethodologies().filter((source) => source.isEnabled);
}

export const CURRENT_RUNTIME_CADENCE_ROWS = [
  {
    process: "Canonical scheduler",
    cadence: PIPELINE_RUNTIME_CADENCE.scheduler,
    route: PIPELINE_RUNTIME_CADENCE.orchestratedRoute,
    behavior: PIPELINE_RUNTIME_CADENCE.orchestratedBehavior,
  },
  {
    process: "Orchestrated pipeline trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.orchestratedCron,
    route: PIPELINE_RUNTIME_CADENCE.orchestratedRoute,
    behavior: "Runs ingest + enrich. In split mode, marks heavy stages as delegated to standalone schedules.",
  },
  {
    process: "Analyze trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.analyzeCron,
    route: PIPELINE_RUNTIME_CADENCE.analyzeRoute,
    behavior: "Cursor-driven heavy stage run with standalone stage metadata.",
  },
  {
    process: "Aggregate trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.aggregateCron,
    route: PIPELINE_RUNTIME_CADENCE.aggregateRoute,
    behavior: "Impacted-day incremental aggregation and co-occurrence recomputation.",
  },
  {
    process: "Coordination trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.coordinationCron,
    route: PIPELINE_RUNTIME_CADENCE.coordinationRoute,
    behavior: "Bounded-runtime coordination detection plus community labeling.",
  },
  {
    process: "Operational briefing trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.briefingCron,
    route: PIPELINE_RUNTIME_CADENCE.briefingRoute,
    behavior: "Independent 6-hour narrative generation not gated by heavy pipeline stages.",
  },
  {
    process: "Weekly executive briefing trigger",
    cadence: PIPELINE_RUNTIME_CADENCE.weeklyExecutiveCron,
    route: PIPELINE_RUNTIME_CADENCE.weeklyExecutiveRoute,
    behavior: PIPELINE_RUNTIME_CADENCE.weeklyExecutiveBehavior,
  },
] as const;

export const LOOKBACK_WINDOW_ROWS = PIPELINE_LOOKBACK_WINDOWS;
