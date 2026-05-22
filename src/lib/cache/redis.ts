import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

let connecting: Promise<void> | null = null;

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

async function ensureConnected(redis: Redis) {
  if (redis.status === "ready" || redis.status === "connect") return;
  if (redis.status === "wait") {
    if (!connecting) {
      connecting = redis.connect().finally(() => { connecting = null; });
    }
    await connecting;
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (!redis) {
    return null;
  }

  try {
    await ensureConnected(redis);
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
    await ensureConnected(redis);
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
    await ensureConnected(redis);
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Cache invalidation failure should not block writes.
  }
}
