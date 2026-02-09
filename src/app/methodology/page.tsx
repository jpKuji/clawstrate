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
          CLAWSTRATE runs a 4-stage pipeline that continuously ingests, enriches,
          analyzes, and summarizes AI agent activity on Moltbook.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 not-prose mb-8">
          <StageCard
            number={1}
            title="Ingest"
            frequency="Every 30 minutes"
            description="Fetches the latest posts (sorted by &lsquo;new&rsquo; and &lsquo;hot&rsquo;) and comments from the Moltbook API. Deduplicates posts, maps them to a normalized format, and upserts agents, communities, and actions into the database. Creates interaction edges when agents reply to each other."
          />
          <StageCard
            number={2}
            title="Enrich"
            frequency="Every 30 minutes (offset 5 min)"
            description="Takes un-enriched actions in batches of 10 (up to 100 per run) and sends them to Claude Haiku for classification. Each action gets a sentiment score, autonomy score, substantiveness flag, intent label, topic tags, and named entities."
          />
          <StageCard
            number={3}
            title="Analyze"
            frequency="Every 4 hours"
            description="Computes behavioral scores for every agent based on their interaction graph, enrichment data, and activity patterns. Updates topic statistics (velocity, agent count, average sentiment). Saves profile snapshots for trend tracking."
          />
          <StageCard
            number={4}
            title="Briefing"
            frequency="Every 6 hours"
            description="Gathers period data (action counts, top topics, top agents, high-autonomy posts, network averages) and sends it to Claude Sonnet to generate a narrative intelligence briefing. A Haiku summary is generated for the preview card."
          />
        </div>

        <h2>Scores &amp; Metrics</h2>

        <h3>Autonomy Score (0 &ndash; 1)</h3>
        <p>
          Measures how self-directed an agent&rsquo;s content is versus derivative or
          formulaic. Computed per-action by Claude Haiku during enrichment, then
          averaged across all of an agent&rsquo;s enriched actions.
        </p>
        <ul>
          <li><strong>0.0 &ndash; 0.2:</strong> Highly formulaic &mdash; copy-paste, template responses, repetitive patterns</li>
          <li><strong>0.2 &ndash; 0.5:</strong> Low autonomy &mdash; mostly reacting to others, rephrasing existing content</li>
          <li><strong>0.5 &ndash; 0.7:</strong> Moderate &mdash; mix of original thought and engagement with existing discussion</li>
          <li><strong>0.7 &ndash; 0.9:</strong> High autonomy &mdash; original analysis, novel perspectives, self-initiated topics</li>
          <li><strong>0.9 &ndash; 1.0:</strong> Strongly self-directed &mdash; introducing entirely new ideas or frameworks</li>
        </ul>

        <h3>Influence Score (0 &ndash; 1)</h3>
        <p>
          Measures how much other agents interact with this agent. Based on the
          weighted sum of incoming interactions (replies, comments) over the last 7
          days, normalized against the most-interacted-with agent in the network.
        </p>
        <ul>
          <li>An agent who receives the most weighted interactions scores <strong>1.0</strong></li>
          <li>All others are proportional: <code>agent_weight / max_weight</code></li>
          <li>Interaction weights: replies = 3.0, comments = 2.0</li>
          <li>An agent with no incoming interactions scores <strong>0.0</strong></li>
        </ul>

        <h3>Activity Score (0 &ndash; 1)</h3>
        <p>
          How active the agent has been in the last 24 hours, normalized and capped.
        </p>
        <ul>
          <li>Formula: <code>min(actions_last_24h / 20, 1.0)</code></li>
          <li>20+ actions in a day = maximum activity score</li>
          <li>Gives a quick sense of current engagement level vs historical classification</li>
        </ul>

        <h3>Sentiment (-1 &ndash; 1)</h3>
        <p>
          Emotional tone of an action&rsquo;s content, classified by Claude Haiku.
        </p>
        <ul>
          <li><strong>-1.0 to -0.3:</strong> Negative &mdash; criticism, complaints, conflict</li>
          <li><strong>-0.3 to 0.3:</strong> Neutral &mdash; informational, factual, balanced</li>
          <li><strong>0.3 to 1.0:</strong> Positive &mdash; supportive, enthusiastic, constructive</li>
        </ul>
        <p>
          <strong>Network Sentiment</strong> on the dashboard is the average across
          all enriched actions, giving a general mood reading of the platform.
        </p>

        <h3>Network Autonomy</h3>
        <p>
          The average autonomy score across all enriched actions. A rising network
          autonomy means agents are producing more original content; a falling one
          suggests more reactive or derivative behavior.
        </p>

        <h2>Agent Classifications</h2>
        <p>
          Agents are classified during the Analyze stage based on their total action
          count and the ratio of posts to comments. Classifications are checked in
          this order:
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
                <td className="py-2"><span className="text-emerald-400 font-medium">content_creator</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 50 AND posts &gt; comments &times; 2</td>
                <td className="py-2">Primarily posts original content. High post-to-comment ratio.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-blue-400 font-medium">commenter</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 50 AND comments &gt; posts &times; 3</td>
                <td className="py-2">Primarily engages through comments/replies. Social participant.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-amber-400 font-medium">active</span></td>
                <td className="py-2 font-mono text-xs">total &gt; 20</td>
                <td className="py-2">Reasonably active but no strong post/comment skew.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-red-400 font-medium">bot_farm</span></td>
                <td className="py-2 font-mono text-xs">autonomy &lt; 0.2 AND total &gt; 30</td>
                <td className="py-2">Suspicious: high volume + very low autonomy. Possible automated spam.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2"><span className="text-zinc-400 font-medium">lurker</span></td>
                <td className="py-2 font-mono text-xs">default</td>
                <td className="py-2">Low activity. Hasn&rsquo;t done enough to be classified yet.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-zinc-500 text-sm">
          Note: conditions are checked top-to-bottom, so an agent with total &gt; 50
          and high comments will match &ldquo;content_creator&rdquo; or &ldquo;commenter&rdquo; before
          &ldquo;active&rdquo;. The &ldquo;bot_farm&rdquo; classification only triggers when total is
          between 21 and 30 with very low autonomy due to evaluation order.
        </p>

        <h2>Topic Metrics</h2>

        <h3>Velocity (actions/hour)</h3>
        <p>
          How fast a topic is being discussed right now. Calculated as the number of
          actions tagged with that topic in the last 24 hours, divided by 24.
          Higher velocity = trending topic.
        </p>

        <h3>Agent Count</h3>
        <p>
          The number of distinct agents who have posted or commented on actions
          tagged with this topic. A high agent count with high velocity indicates
          broad interest, not just one agent spamming.
        </p>

        <h3>Average Sentiment</h3>
        <p>
          The mean sentiment score across all enriched actions for this topic. Helps
          identify topics that are generating positive engagement vs controversy.
        </p>

        <h2>Enrichment Details</h2>
        <p>
          Each action is sent to <strong>Claude Haiku</strong> (claude-haiku-4-5-20251001) in
          batches of 10. The model receives the action&rsquo;s title, content, type, and
          platform metadata, and returns:
        </p>
        <ul>
          <li><strong>sentiment</strong> &mdash; float from -1 to 1</li>
          <li><strong>autonomyScore</strong> &mdash; float from 0 to 1</li>
          <li><strong>isSubstantive</strong> &mdash; boolean, whether the content has real substance</li>
          <li><strong>intent</strong> &mdash; one of: inform, question, debate, promote, spam, social, meta</li>
          <li><strong>topics</strong> &mdash; array of topic slugs with relevance scores (0&ndash;1)</li>
          <li><strong>entities</strong> &mdash; named entities mentioned (agent names, tools, projects)</li>
        </ul>

        <h2>Briefings</h2>
        <p>
          Briefings are generated by <strong>Claude Sonnet</strong> (claude-sonnet-4-5-20250929)
          every 6 hours. The model receives a structured data summary including:
        </p>
        <ul>
          <li>Total actions and active agents in the period</li>
          <li>Top 10 topics by velocity</li>
          <li>Top 10 agents by influence</li>
          <li>High-autonomy substantive posts (autonomy &gt; 0.7)</li>
          <li>Network-wide autonomy and sentiment averages</li>
        </ul>
        <p>
          The briefing is structured as an intelligence report with sections for key
          developments, trending topics, notable agents, behavioral signals, and
          things to watch. A one-sentence summary is generated by Haiku for the
          dashboard preview card.
        </p>

        <h2>Interaction Graph</h2>
        <p>
          When an agent replies to or comments on another agent&rsquo;s post, an
          interaction edge is created between them. Edges have weights (replies
          weigh more than comments) and are used to compute influence scores. Self-replies
          (an agent replying to their own post) do not create edges.
        </p>
        <p>
          The interaction graph is the foundation of the influence score. Agents who
          receive many weighted interactions from diverse agents score higher than
          those who only interact with themselves or receive few responses.
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
                <td className="py-2">Latest 25 new + 25 hot</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Enrichment scores</td>
                <td className="py-2">Every 30 min</td>
                <td className="py-2">Up to 100 un-enriched per run</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Agent scores</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">Influence: 7 days. Activity: 24 hours.</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Topic velocity</td>
                <td className="py-2">Every 4 hours</td>
                <td className="py-2">24-hour trailing window</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Briefings</td>
                <td className="py-2">Every 6 hours</td>
                <td className="py-2">6-hour period</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-2">Dashboard page cache</td>
                <td className="py-2">60 seconds</td>
                <td className="py-2">&mdash;</td>
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
