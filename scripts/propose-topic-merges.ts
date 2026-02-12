/**
 * Propose semantic topic merges using Claude (Haiku), writing results to topic_merge_proposals.
 *
 * Usage:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... npx tsx scripts/propose-topic-merges.ts --limit 40
 */

import { proposeSemanticTopicMerges } from "../src/lib/topics/semantic-merge";

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const limit = Number(argValue("--limit") || "40");
  const minActionCount = Number(argValue("--min-actions") || "1");

  const result = await proposeSemanticTopicMerges({
    limitClusters: Number.isFinite(limit) ? limit : 40,
    minActionCount: Number.isFinite(minActionCount) ? minActionCount : 1,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

