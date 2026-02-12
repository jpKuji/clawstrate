import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { actions, communities } from "@/lib/db/schema";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET() {
  const cacheKey = "marketplace:summary";
  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
  }

  const platformFilter = eq(actions.platformId, "rentahuman");

  const [bountyCount, assignmentCount, fulfillmentResult, topCategories, priceStats, recentBounties] = await Promise.all([
    // totalBounties: posts on rentahuman
    db.select({ count: count(actions.id) })
      .from(actions)
      .where(and(platformFilter, eq(actions.actionType, "post"))),

    // totalAssignments: comments on rentahuman
    db.select({ count: count(actions.id) })
      .from(actions)
      .where(and(platformFilter, eq(actions.actionType, "comment"))),

    // fulfillmentRate: bounties with at least one child assignment
    db.execute(sql`
      SELECT
        COUNT(DISTINCT p.id) FILTER (WHERE c.id IS NOT NULL) AS fulfilled,
        COUNT(DISTINCT p.id) AS total
      FROM actions p
      LEFT JOIN actions c ON c.parent_action_id = p.id AND c.action_type = 'comment'
      WHERE p.platform_id = 'rentahuman' AND p.action_type = 'post'
    `),

    // topCategories: GROUP BY community for bounty posts
    db.select({
      name: actions.communityId,
      count: count(actions.id),
    })
      .from(actions)
      .where(and(platformFilter, eq(actions.actionType, "post"), sql`${actions.communityId} IS NOT NULL`))
      .groupBy(actions.communityId)
      .orderBy(desc(count(actions.id)))
      .limit(8),

    // priceStats: avg/min/max price from bounty rawData
    db.execute(sql`
      SELECT
        AVG((raw_data->>'price')::numeric) AS avg_price,
        MIN((raw_data->>'price')::numeric) AS min_price,
        MAX((raw_data->>'price')::numeric) AS max_price
      FROM actions
      WHERE platform_id = 'rentahuman'
        AND action_type = 'post'
        AND raw_data->>'price' IS NOT NULL
        AND (raw_data->>'price')::numeric > 0
    `),

    // recentBounties: 5 most recent
    db.query.actions.findMany({
      where: and(platformFilter, eq(actions.actionType, "post")),
      orderBy: [desc(actions.performedAt)],
      limit: 5,
    }),
  ]);

  // Parse top skills from bounty rawData.skillsNeeded (JSON arrays)
  const skillBounties = await db.execute(sql`
    SELECT raw_data->>'skillsNeeded' AS skills_json
    FROM actions
    WHERE platform_id = 'rentahuman'
      AND action_type = 'post'
      AND raw_data->>'skillsNeeded' IS NOT NULL
  `);

  const skillCounts = new Map<string, number>();
  const skillRows = "rows" in skillBounties ? skillBounties.rows : skillBounties;
  for (const row of skillRows as Array<{ skills_json: string }>) {
    try {
      const skills = JSON.parse(row.skills_json);
      if (Array.isArray(skills)) {
        for (const skill of skills) {
          if (typeof skill === "string") {
            skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
          }
        }
      }
    } catch { /* skip malformed */ }
  }
  const topSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  // Resolve category names from community IDs
  const categoryIds = topCategories.map(c => c.name).filter(Boolean) as string[];
  let categoryNameMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const communityRows = await db.query.communities.findMany({
      where: sql`${communities.id} IN (${sql.join(categoryIds.map(id => sql`${id}`), sql`, `)})`,
    });
    categoryNameMap = new Map(communityRows.map(c => [c.id, c.displayName || c.name]));
  }

  const totalBounties = Number(bountyCount[0]?.count ?? 0);
  const totalAssignments = Number(assignmentCount[0]?.count ?? 0);

  const fulfillmentRows = "rows" in fulfillmentResult ? fulfillmentResult.rows : fulfillmentResult;
  const fulfillRow = (fulfillmentRows as any[])[0];
  const fulfilled = Number(fulfillRow?.fulfilled ?? 0);
  const totalForRate = Number(fulfillRow?.total ?? 0);
  const fulfillmentRate = totalForRate > 0 ? fulfilled / totalForRate : 0;

  const priceRows = "rows" in priceStats ? priceStats.rows : priceStats;
  const priceRow = (priceRows as any[])[0];

  const response = {
    totalBounties,
    totalAssignments,
    fulfillmentRate: Math.round(fulfillmentRate * 100),
    priceStats: {
      avg: Number(priceRow?.avg_price ?? 0),
      min: Number(priceRow?.min_price ?? 0),
      max: Number(priceRow?.max_price ?? 0),
    },
    topCategories: topCategories.map(c => ({
      name: categoryNameMap.get(c.name as string) || c.name || "Unknown",
      count: Number(c.count),
    })),
    topSkills,
    recentBounties: recentBounties.map(b => ({
      id: b.id,
      title: b.title,
      category: null as string | null, // resolved below
      price: (b.rawData as any)?.price ?? null,
      priceType: (b.rawData as any)?.priceType ?? null,
      currency: (b.rawData as any)?.currency ?? null,
      applicationCount: b.replyCount,
      performedAt: b.performedAt,
    })),
  };

  // Cache for 5 minutes
  await cacheSet(cacheKey, response, 300);

  return NextResponse.json(response);
}
