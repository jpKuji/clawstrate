import { PageContainer } from "@/components/layout/PageContainer";

export default function MethodologyPage() {
  return (
    <PageContainer
      title="Methodology"
      description="How CLAWSTRATE collects, processes, and scores AI agent behavior"
    >
      <div className="prose prose-invert prose-zinc max-w-none">
        <h2>Data Pipeline</h2>
        <p>
          CLAWSTRATE runs a multi-stage pipeline that continuously ingests, enriches,
          analyzes, aggregates, detects coordination, and summarizes AI agent activity on Moltbook.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 not-prose mb-8">
          <StageCard
            number={1}
            title="Ingest"
            frequency="Every 30 minutes"
            description="Fetches posts from three feeds (new, hot, rising) plus the top 5 most active submolts. Comments are prioritized by engagement (comment_count > 5, up to 20 posts). Creates interaction edges when agents reply to each other."
          />
          <StageCard
            number={2}
            title="Enrich"
            frequency="Every 30 minutes (offset 5 min)"
            description="Sends unenriched actions to Claude Haiku in batches of 10 (up to 100 per run). Each action receives originality, behavioral independence, and coordination signal scores, plus sentiment, substantiveness, intent, topics, and entities. Parent context is included for replies."
          />
          <StageCard
            number={3}
            title="Analyze"
            frequency="Every 4 hours"
            description="Computes PageRank-style influence scores weighted by reply quality. Calculates quality-weighted activity scores. Classifies agents into types. Detects temporal patterns (posting regularity, peak hours, burst detection)."
          />
          <StageCard
            number={4}
            title="Aggregate"
            frequency="After each analyze cycle"
            description="Computes daily statistics per agent (posts, comments, upvotes, sentiment, originality, unique topics, interlocutors, word count) and per topic (velocity, agent count, sentiment). Tracks topic co-occurrences."
          />
          <StageCard
            number={5}
            title="Coordination Detection"
            frequency="After analyze cycle"
            description="Three detection methods: temporal clustering (3+ unconnected agents posting on same topic within 2h), content similarity (Jaccard > 0.8 on topic vectors), and reply clique detection (> 80% internal interactions). Also runs label propagation community detection."
          />
          <StageCard
            number={6}
            title="Briefing"
            frequency="Every 6 hours"
            description="Claude Sonnet generates structured JSON briefings with sections, citations, metrics, and alerts. Includes coordination signals and daily trend data. Citations are validated against the database. Summary via Haiku."
          />
        </div>

        <h2>Scores &amp; Metrics</h2>

        <h3>Originality Score (0 &ndash; 1)</h3>
        <p>
          Measures whether an action contains novel ideas, original framing, or unique analysis
          versus restated common knowledge or template responses.
        </p>
        <ul>
          <li><strong>0.0 &ndash; 0.2:</strong> Restates common knowledge, template response, copy-paste from training data</li>
          <li><strong>0.2 &ndash; 0.5:</strong> Standard engagement with minimal personal perspective</li>
          <li><strong>0.5 &ndash; 0.7:</strong> Some original perspective or novel framing</li>
          <li><strong>0.7 &ndash; 1.0:</strong> Introduces new concepts, original research, creative synthesis</li>
        </ul>

        <h3>Behavioral Independence (0 &ndash; 1)</h3>
        <p>
          Measures whether an agent is acting on its own goals versus pure prompt-response behavior.
        </p>
        <ul>
          <li><strong>0.0 &ndash; 0.2:</strong> Purely reactive, generic greeting, formulaic response to stimulus</li>
          <li><strong>0.2 &ndash; 0.5:</strong> Normal engagement, responds appropriately but doesn&rsquo;t drive conversation</li>
          <li><strong>0.5 &ndash; 0.7:</strong> Shows some initiative, contributes beyond what was asked</li>
          <li><strong>0.7 &ndash; 1.0:</strong> Tangential contributions, self-referential continuity, multi-post narratives, initiating new directions</li>
        </ul>

        <h3>Coordination Signal (0 &ndash; 1)</h3>
        <p>
          Estimates the likelihood that an action is part of a coordinated pattern rather than independent behavior.
        </p>
        <ul>
          <li><strong>0.0 &ndash; 0.2:</strong> Clearly independent, unique voice and timing</li>
          <li><strong>0.2 &ndash; 0.5:</strong> Some similarity to other posts but likely coincidental</li>
          <li><strong>0.5 &ndash; 0.8:</strong> Suspicious similarity or timing patterns</li>
          <li><strong>0.8 &ndash; 1.0:</strong> Identical phrasing across agents, simultaneous topic flooding, templated format</li>
        </ul>

        <h3>Autonomy Score (backward compat)</h3>
        <p>
          Computed as <code>(originality + behavioral_independence) / 2</code>.
          This preserves backward compatibility with the original single-score system while
          the new orthogonal signals provide richer analysis.
        </p>

        <h3>Influence Score (0 &ndash; 1) &mdash; PageRank</h3>
        <p>
          Computed using a simplified PageRank algorithm (10 iterations, damping factor 0.85)
          on the 7-day interaction graph. Unlike simple weight sums, PageRank means being
          replied to by a high-influence agent matters more than being replied to by many
          low-influence agents.
        </p>
        <ul>
          <li>Interactions are weighted by reply quality: substantive replies count 1.5&times;, non-substantive 0.5&times;</li>
          <li>Normalized to 0&ndash;1 against the highest-scoring agent</li>
          <li>Self-replies do not create edges</li>
        </ul>

        <h3>Activity Score (0 &ndash; 1) &mdash; Quality-Weighted</h3>
        <p>
          How active the agent has been in the last 24 hours, weighted by content quality:
        </p>
        <ul>
          <li>Substantive actions count 1.0</li>
          <li>Non-substantive actions count 0.3</li>
          <li>Unenriched actions count 0.5</li>
          <li>Formula: <code>min(qualityWeighted / 15, 1.0)</code></li>
        </ul>

        <h3>Sentiment (-1 &ndash; 1)</h3>
        <p>
          Emotional tone classified by Claude Haiku. Network Sentiment is the
          average across all enriched actions.
        </p>

        <h2>Agent Classifications</h2>
        <p>
          Agents are classified during the Analyze stage. Conditions are checked
          in this order (first match wins):
        </p>

        <div className="not-prose">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 text-zinc-400 font-medium">Type</th>
                <th className="text-left py-2 text-zinc-400 font-medium">Condition</th>
                <th className="text-left py-2 text-zinc-400 font-medium">What it means</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-red-400 font-medium">bot_farm</span></td>
                <td className="py-2 font-mono text-xs">autonomy &lt; 0.2 AND total &gt; 30</td>
                <td className="py-2">Suspicious: high volume + very low autonomy. Checked FIRST to prevent masking by other types.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-emerald-400 font-medium">content_creator</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 50 AND posts &gt; comments &times; 2</td>
                <td className="py-2">Primarily posts original content. High post-to-comment ratio.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-blue-400 font-medium">commenter</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 50 AND comments &gt; posts &times; 3</td>
                <td className="py-2">Primarily engages through comments/replies.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-purple-400 font-medium">conversationalist</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 50</td>
                <td className="py-2">High activity with balanced post/comment ratio.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-amber-400 font-medium">active</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 20</td>
                <td className="py-2">Reasonably active but below 50 total actions.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-pink-400 font-medium">rising</span></td>
                <td className="py-2 font-mono text-xs">10&ndash;20 actions AND first seen &lt; 7 days</td>
                <td className="py-2">New agent showing early engagement. Worth watching.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-zinc-400 font-medium">lurker</span></td>
                <td className="py-2 font-mono text-xs">default</td>
                <td className="py-2">Low activity. Hasn&rsquo;t done enough to be classified yet.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Coordination Detection</h2>
        <p>
          CLAWSTRATE uses three methods to detect coordinated behavior among agents:
        </p>
        <ul>
          <li>
            <strong>Temporal Clustering:</strong> Flags when 3+ unconnected agents post about
            the same topic within a 2-hour window. Low prior interaction density between
            the agents increases the confidence score.
          </li>
          <li>
            <strong>Content Similarity:</strong> Computes Jaccard similarity on each pair of
            agents&rsquo; topic vectors over 7 days. Similarity above 0.8 is flagged. Only
            agents with 3+ topics are compared.
          </li>
          <li>
            <strong>Reply Clique Detection:</strong> Identifies groups of agents where over
            80% of their interactions are within the group, suggesting an insular or
            coordinated cluster.
          </li>
        </ul>

        <h3>Community Detection</h3>
        <p>
          Label propagation runs on the 14-day interaction graph (undirected, weighted).
          Each agent adopts the most common label among its neighbors. This reveals natural
          community structures — groups of agents that frequently interact with each other.
          Community labels are displayed in the network graph.
        </p>

        <h2>Temporal Patterns</h2>
        <p>
          Using daily aggregation data, the analyze pipeline computes:
        </p>
        <ul>
          <li>
            <strong>Posting Regularity:</strong> Standard deviation of daily action counts
            over 14 days. Low regularity (consistent daily volume) may indicate automated
            behavior.
          </li>
          <li>
            <strong>Peak Hour (UTC):</strong> The most common hour of day the agent posts.
            Consistent single-hour activity is suspicious.
          </li>
          <li>
            <strong>Burst Count (7d):</strong> Number of days in the last week where the
            agent&rsquo;s action count exceeded 3&times; their 14-day daily average.
          </li>
        </ul>

        <h2>Topic Metrics</h2>

        <h3>Velocity (actions/hour)</h3>
        <p>
          Actions tagged with this topic in the last 24 hours, divided by 24.
          Higher velocity = trending topic.
        </p>

        <h3>Co-occurring Topics</h3>
        <p>
          When an action is tagged with multiple topics, co-occurrence counts are
          incremented for each pair. This reveals thematic relationships between topics.
        </p>

        <h2>Enrichment Details</h2>
        <p>
          Each action is sent to <strong>Claude Haiku</strong> in batches of 10. The model
          receives the action&rsquo;s title, content (up to 1500 chars), type, and parent
          context for replies. It returns:
        </p>
        <ul>
          <li><strong>sentiment</strong> &mdash; float from -1 to 1</li>
          <li><strong>originality</strong> &mdash; float from 0 to 1 (novel ideas vs common knowledge)</li>
          <li><strong>behavioral_independence</strong> &mdash; float from 0 to 1 (own goals vs prompt-response)</li>
          <li><strong>coordination_signal</strong> &mdash; float from 0 to 1 (coordinated pattern likelihood)</li>
          <li><strong>isSubstantive</strong> &mdash; boolean, whether the content has real substance</li>
          <li><strong>intent</strong> &mdash; one of: inform, question, debate, promote, spam, social, meta, technical, creative, coordinate, probe, roleplay, meta_commentary</li>
          <li><strong>topics</strong> &mdash; array of topic slugs with relevance scores (0&ndash;1)</li>
          <li><strong>entities</strong> &mdash; named entities mentioned</li>
        </ul>
        <p>
          Deterministic content metrics (word count, sentence count, code blocks, citations, URLs)
          are computed before the LLM call and stored alongside the enrichment.
        </p>

        <h2>Briefings</h2>
        <p>
          Briefings are generated by <strong>Claude Sonnet</strong> every 6 hours using
          structured JSON output with collapsible sections, clickable citations, inline
          metrics, and coordination alerts. The data summary includes:
        </p>
        <ul>
          <li>Total actions and active agents in the period</li>
          <li>Top 10 topics by velocity and top 10 agents by influence</li>
          <li>High-autonomy substantive posts (autonomy &gt; 0.7)</li>
          <li>Coordination signals detected during the period</li>
          <li>3-day trend data from daily aggregation tables</li>
          <li>Network-wide autonomy and sentiment averages</li>
        </ul>
        <p>
          After generation, citations are validated: cited agents and topics are checked
          against the database, and claimed metrics are compared to actual data.
          Warnings are displayed alongside the briefing.
        </p>

        <h2>Network Graph</h2>
        <p>
          The interactive network graph displays the top 50 agents by influence with their
          7-day interactions. Nodes are sized by influence score and colored by agent type.
          Edges are weighted by interaction strength. Community labels (from label propagation)
          can also be used for coloring.
        </p>

        <h2>Data Freshness</h2>
        <div className="not-prose">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 text-zinc-400 font-medium">Data</th>
                <th className="text-left py-2 text-zinc-400 font-medium">Update Frequency</th>
                <th className="text-left py-2 text-zinc-400 font-medium">Lookback Window</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Posts &amp; comments</td>
                <td className="py-2">Every 30 min</td>
                <td className="py-2">3 feeds + 5 submolts + 20 comment sets</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Enrichment scores</td>
                <td className="py-2">Every 30 min</td>
                <td className="py-2">Up to 100 unenriched per run</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Agent scores (PageRank)</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">Influence: 7 days. Activity: 24 hours.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Daily aggregations</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">Current day, refreshed each cycle</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Coordination detection</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">24h temporal, 7d similarity, 7d cliques</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Community detection</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">14-day interaction graph</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Topic velocity</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">24-hour trailing window</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Temporal patterns</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">14-day window</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Briefings</td>
                <td className="py-2">Every 6 hours</td>
                <td className="py-2">6-hour period</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">API cache (Redis)</td>
                <td className="py-2">60&ndash;120 seconds</td>
                <td className="py-2">Invalidated on pipeline completion</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}

function StageCard({
  number,
  title,
  frequency,
  description,
}: {
  number: number;
  title: string;
  frequency: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
          {number}
        </span>
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      </div>
      <p className="text-xs text-zinc-500 mb-2">{frequency}</p>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
