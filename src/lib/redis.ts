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

/**
 * Get a cached value from Redis.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get<T>(`cache:${key}`);
  return data ?? null;
}

/**
 * Set a cached value in Redis with TTL.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = 60
): Promise<void> {
  await redis.set(`cache:${key}`, JSON.stringify(value), { ex: ttlSeconds });
}

/**
 * Invalidate cache keys by pattern prefix.
 */
export async function cacheInvalidate(prefix: string): Promise<void> {
  // For Upstash REST API, we can't use SCAN easily, so invalidate known keys
  const keys = [`cache:${prefix}`];
  for (const key of keys) {
    await redis.del(key);
  }
}

/**
 * Invalidate all API caches. Call after pipeline completion.
 */
export async function invalidateApiCaches(): Promise<void> {
  await Promise.all([
    redis.del("cache:dashboard"),
    redis.del("cache:agents:default"),
    redis.del("cache:topics:default"),
  ]);
}
