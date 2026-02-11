import type { PipelineStageName } from "@/lib/pipeline/metadata";

export interface MethodologyStage {
  id: PipelineStageName;
  title: string;
  description: string;
}

export interface ScoreBand {
  range: string;
  meaning: string;
}

export interface MethodologyScoreMetric {
  name: string;
  description: string;
  formula?: string;
  bands?: ScoreBand[];
}

export interface AgentClassificationRule {
  type: string;
  condition: string;
  interpretation: string;
}

export interface CoordinationMethodDefinition {
  name: string;
  definition: string;
}

export interface FreshnessRow {
  data: string;
  updateFrequency: string;
  lookbackWindow: string;
}

export interface SourceMethodologyMetric {
  label: string;
  value: string;
}

export interface SourceMethodology {
  id: string;
  displayName: string;
  status: "active" | "beta" | "disabled";
  coverageSummary: string;
  ingestionBehavior: string[];
  identityModel: string;
  knownLimitations: string[];
  sourceSpecificMetrics: SourceMethodologyMetric[];
}

export interface MethodologySourceView extends SourceMethodology {
  isEnabled: boolean;
}

export interface GlobalMethodologyConfig {
  title: string;
  description: string;
  intro: string;
  pipelineSummary: string;
  stages: MethodologyStage[];
  scoreMetrics: MethodologyScoreMetric[];
  classificationIntro: string;
  classificationRules: AgentClassificationRule[];
  coordinationMethods: CoordinationMethodDefinition[];
  communityDetectionDescription: string;
  temporalPatternDescriptions: string[];
  topicMetricDescriptions: string[];
  briefingDescriptions: string[];
  networkGraphDescription: string;
  freshnessRows: FreshnessRow[];
}
