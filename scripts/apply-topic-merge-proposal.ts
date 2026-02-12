/**
 * Apply a semantic merge proposal produced by propose-topic-merges.ts (or /api/cron/topic-merges).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/apply-topic-merge-proposal.ts --id <proposal-uuid>
 *   DATABASE_URL=... npx tsx scripts/apply-topic-merge-proposal.ts --id <proposal-uuid> --force
 */

import { applyTopicMergeProposal } from "../src/lib/topics/apply-merge";

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const id = argValue("--id");
  if (!id) {
    console.error("Missing --id <proposal-uuid>");
    process.exit(2);
  }

  const force = process.argv.includes("--force");
  const res = await applyTopicMergeProposal({ proposalId: id, force });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

