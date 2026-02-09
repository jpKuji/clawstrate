import { db } from "./index";
import { platforms } from "./schema";

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

  console.log("Seeded platforms");
}

seed().catch(console.error);
