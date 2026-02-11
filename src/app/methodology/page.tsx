import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CURRENT_RUNTIME_CADENCE_ROWS,
  GLOBAL_METHODOLOGY_CONFIG,
  LOOKBACK_WINDOW_ROWS,
  getEnabledSourceMethodologies,
} from "@/lib/methodology/config";
import type { MethodologySourceView } from "@/lib/methodology/types";

export default function MethodologyPage() {
  const sources = getEnabledSourceMethodologies();

  return (
    <PageContainer
      title={GLOBAL_METHODOLOGY_CONFIG.title}
      description={GLOBAL_METHODOLOGY_CONFIG.description}
    >
      <div className="space-y-10">
        <section className="max-w-none">
          <p className="text-sm text-zinc-400 leading-relaxed">{GLOBAL_METHODOLOGY_CONFIG.intro}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Global Pipeline</h2>
          <p className="text-sm text-zinc-400">{GLOBAL_METHODOLOGY_CONFIG.pipelineSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {GLOBAL_METHODOLOGY_CONFIG.stages.map((stage, idx) => (
              <div key={stage.id} className="border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                    {idx + 1}
                  </span>
                  <h3 className="font-medium text-zinc-100">{stage.title}</h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{stage.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Current Runtime Cadence</h2>
          <MethodologyTable
            headers={["Process", "Cadence", "Route", "Behavior"]}
            rows={CURRENT_RUNTIME_CADENCE_ROWS.map((row) => [
              row.process,
              row.cadence,
              row.route,
              row.behavior,
            ])}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Lookback Windows</h2>
          <MethodologyTable
            headers={["Signal Area", "Window", "Details"]}
            rows={LOOKBACK_WINDOW_ROWS.map((row) => [row.area, row.window, row.details])}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Scores &amp; Metrics</h2>
          <div className="space-y-3">
            {GLOBAL_METHODOLOGY_CONFIG.scoreMetrics.map((metric) => (
              <div key={metric.name} className="border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-sm font-semibold text-zinc-100">{metric.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">{metric.description}</p>
                {metric.formula && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Formula: <code>{metric.formula}</code>
                  </p>
                )}
                {metric.bands && metric.bands.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                    {metric.bands.map((band) => (
                      <li key={`${metric.name}-${band.range}`}>
                        <span className="text-zinc-300 font-medium">{band.range}</span>: {band.meaning}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Agent Classification</h2>
          <p className="text-sm text-zinc-400">{GLOBAL_METHODOLOGY_CONFIG.classificationIntro}</p>
          <MethodologyTable
            headers={["Type", "Condition", "Interpretation"]}
            rows={GLOBAL_METHODOLOGY_CONFIG.classificationRules.map((rule) => [
              rule.type,
              rule.condition,
              rule.interpretation,
            ])}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Coordination &amp; Communities</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            {GLOBAL_METHODOLOGY_CONFIG.coordinationMethods.map((method) => (
              <li key={method.name}>
                <span className="text-zinc-200 font-medium">{method.name}:</span> {method.definition}
              </li>
            ))}
          </ul>
          <p className="text-sm text-zinc-400">{GLOBAL_METHODOLOGY_CONFIG.communityDetectionDescription}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Source Methodology</h2>
          <MethodologySourcesSection sources={sources} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Temporal, Topic, Briefing, and Graph Notes</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BulletCard title="Temporal Patterns" items={GLOBAL_METHODOLOGY_CONFIG.temporalPatternDescriptions} />
            <BulletCard title="Topic Metrics" items={GLOBAL_METHODOLOGY_CONFIG.topicMetricDescriptions} />
            <BulletCard title="Briefings" items={GLOBAL_METHODOLOGY_CONFIG.briefingDescriptions} />
            <div className="border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-2">Network Graph</h3>
              <p className="text-sm text-zinc-400">{GLOBAL_METHODOLOGY_CONFIG.networkGraphDescription}</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100">Data Freshness</h2>
          <MethodologyTable
            headers={["Data", "Update Frequency", "Lookback / Scope"]}
            rows={GLOBAL_METHODOLOGY_CONFIG.freshnessRows.map((row) => [
              row.data,
              row.updateFrequency,
              row.lookbackWindow,
            ])}
          />
        </section>
      </div>
    </PageContainer>
  );
}

export function MethodologySourcesSection({
  sources,
}: {
  sources: MethodologySourceView[];
}) {
  if (sources.length === 0) {
    return (
      <div className="border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">
          No enabled source adapters are currently configured. Global methodology remains active, but no per-source coverage is available yet.
        </p>
      </div>
    );
  }

  return (
    <Tabs defaultValue={sources[0].id} className="w-full">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {sources.map((source) => (
          <TabsTrigger key={source.id} value={source.id}>
            {source.displayName}
          </TabsTrigger>
        ))}
      </TabsList>

      {sources.map((source) => (
        <TabsContent key={source.id} value={source.id} className="mt-4 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-base font-semibold text-zinc-100">{source.displayName}</h3>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {source.status}
              </Badge>
            </div>
            <p className="text-sm text-zinc-400">{source.coverageSummary}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BulletCard title="Ingestion Behavior" items={source.ingestionBehavior} />
            <div className="border border-zinc-800 bg-zinc-900/50 p-4">
              <h4 className="text-sm font-semibold text-zinc-100 mb-2">Identity Model</h4>
              <p className="text-sm text-zinc-400">{source.identityModel}</p>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-2">
              <h4 className="text-sm font-semibold text-zinc-100 mb-3">Source-Specific Metrics</h4>
              <MethodologyTable
                headers={["Metric", "Value"]}
                rows={source.sourceSpecificMetrics.map((metric) => [metric.label, metric.value])}
              />
            </div>
            <BulletCard title="Known Limitations" items={source.knownLimitations} />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function BulletCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-2">{title}</h3>
      <ul className="space-y-1 text-sm text-zinc-400">
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MethodologyTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/70">
          <tr className="border-b border-zinc-800">
            {headers.map((header) => (
              <th key={header} className="text-left py-2.5 px-3 text-zinc-400 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {rows.map((row) => (
            <tr key={row.join("|")} className="border-b border-zinc-800/50 last:border-b-0">
              {row.map((cell) => (
                <td key={cell} className="py-2.5 px-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
