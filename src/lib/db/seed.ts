import { db } from "./index";
import { platforms, accounts } from "./schema";

async function seed() {
  await db
    .insert(platforms)
    .values({
      id: "moltbook",
      name: "Moltbook",
      type: "social",
      apiBase: "https://www.moltbook.com/api/v1",
      config: {
        rateLimit: 100, // per minute
        postCooldown: 30, // minutes
        commentCooldown: 20, // seconds
      },
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(platforms)
    .values({
      id: "rentahuman",
      name: "RentAHuman.ai",
      type: "marketplace",
      apiBase: "https://rentahuman.ai/api",
      config: {
        rateLimitRpmPublic: 100,
        rateLimitRpmAuth: 300,
      },
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(accounts)
    .values({
      id: "default",
      name: "Default Account",
      tier: "free",
      monthlyBriefingViewQuota: 1000,
      monthlyAlertInteractionQuota: 2000,
      monthlyOnchainApiCallQuota: 5000,
      monthlyOnchainExportQuota: 100,
    })
    .onConflictDoNothing();

  console.log("Seeded platforms");
}

seed().catch(console.error);
