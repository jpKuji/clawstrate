/**
 * One-time script to register QStash scheduled jobs for the CLAWSTRATE pipeline.
 *
 * Usage:
 *   npx tsx scripts/setup-qstash.ts
 *
 * Requires env vars: QSTASH_TOKEN, CRON_SECRET, NEXT_PUBLIC_BASE_URL (production URL)
 */

import { Client } from "@upstash/qstash";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.argv[2] || "https://clawstrate.vercel.app";

if (!QSTASH_TOKEN || !CRON_SECRET) {
  console.error("Missing QSTASH_TOKEN or CRON_SECRET in environment");
  process.exit(1);
}

const client = new Client({ token: QSTASH_TOKEN });

const schedules = [
  {
    destination: `${BASE_URL}/api/cron/pipeline`,
    cron: "*/30 * * * *",
    name: "clawstrate-pipeline",
  },
  {
    destination: `${BASE_URL}/api/cron/analyze`,
    cron: "5 */2 * * *",
    name: "clawstrate-analyze",
  },
  {
    destination: `${BASE_URL}/api/cron/aggregate`,
    cron: "15 */2 * * *",
    name: "clawstrate-aggregate",
  },
  {
    destination: `${BASE_URL}/api/cron/coordination`,
    cron: "25 */2 * * *",
    name: "clawstrate-coordination",
  },
  {
    destination: `${BASE_URL}/api/cron/briefing`,
    cron: "0 */6 * * *",
    name: "clawstrate-briefing",
  },
  {
    destination: `${BASE_URL}/api/cron/briefing-weekly`,
    cron: "0 9 * * 1",
    name: "clawstrate-briefing-weekly",
  },
  {
    destination: `${BASE_URL}/api/cron/topic-merges`,
    cron: "0 */6 * * *",
    name: "clawstrate-topic-merges",
  },
];

async function main() {
  console.log(`Setting up QStash schedules targeting ${BASE_URL}\n`);

  // List existing schedules to avoid duplicates
  const existing = await client.schedules.list();
  for (const s of existing) {
    if (
      s.destination &&
      typeof s.destination === "string" &&
      s.destination.includes("clawstrate")
    ) {
      console.log(`Removing existing schedule: ${s.scheduleId} → ${s.destination}`);
      await client.schedules.delete(s.scheduleId);
    }
  }

  for (const s of schedules) {
    const result = await client.schedules.create({
      destination: s.destination,
      cron: s.cron,
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    console.log(`Created: ${s.name} (${s.cron}) → ${result.scheduleId}`);
  }

  console.log("\nAll schedules registered.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
