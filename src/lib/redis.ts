import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Simple distributed lock using Redis SET NX EX.
 * Returns a release function if lock acquired, null if not.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number = 300
): Promise<(() => Promise<void>) | null> {
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random()}`;
  const acquired = await redis.set(lockKey, lockValue, {
    nx: true,
    ex: ttlSeconds,
  });

  if (!acquired) return null;

  return async () => {
    // Only release if we still own the lock
    const current = await redis.get(lockKey);
    if (current === lockValue) {
      await redis.del(lockKey);
    }
  };
}
