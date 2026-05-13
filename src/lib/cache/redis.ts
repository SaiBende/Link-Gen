import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

export function getRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  return globalForRedis.redis;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (!redis) {
    return null;
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
) {
  const redis = getRedis();

  if (!redis) {
    return;
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Redis is a speed layer; Postgres remains the source of truth.
  }
}

export async function deleteCacheKeys(pattern: string) {
  const redis = getRedis();

  if (!redis) {
    return;
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Cache invalidation failure should not block writes.
  }
}
