import IORedis from "ioredis";
import { config } from "./index.js";

let redis: IORedis | null = null;

export const getRedis = (): IORedis | null => {
  if (!redis) {
    try {
      redis = new IORedis(config.redis.url, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      redis.on("error", (err: Error) => console.warn("Redis error:", err.message));
    } catch {
      console.warn("Redis unavailable, caching disabled");
      return null;
    }
  }
  return redis;
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const client = getRedis();
  if (!client) return null;
  try {
    const data = await client.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds = 3600
): Promise<void> => {
  const client = getRedis();
  if (!client) return;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* ignore cache failures */
  }
};

export const cacheDel = async (pattern: string): Promise<void> => {
  const client = getRedis();
  if (!client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(...keys);
  } catch {
    /* ignore */
  }
};
