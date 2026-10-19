import { Redis as RedisClient } from "ioredis";
import { config } from "./index.js";

// Redis is optional. Without REDIS_URL (or with DISABLE_REDIS=true), or whenever
// Redis is unreachable, the cache helpers fall back to a bounded in-memory LRU.
// That fits single-process shared hosting such as cPanel/Passenger.

let redis: RedisClient | null = null;
let redisReady = false;

const redisEnabled = () => process.env.DISABLE_REDIS !== "true" && Boolean(process.env.REDIS_URL);

export const getRedis = (): RedisClient | null => {
  if (!redisEnabled()) return null;
  if (!redis) {
    try {
      redis = new RedisClient(config.redis.url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      redis.on("ready", () => {
        redisReady = true;
      });
      redis.on("end", () => {
        redisReady = false;
      });
      redis.on("error", (err: Error) => {
        redisReady = false;
        console.warn("Redis error (using in-memory cache):", err.message);
      });
    } catch {
      console.warn("Redis unavailable, using in-memory cache");
      return null;
    }
  }
  return redis;
};

const activeRedis = () => (redisReady ? redis : null);

// ---------------------------------------------------------------------------
// In-memory fallback: a Map in insertion order doubles as an LRU
// ---------------------------------------------------------------------------
const MAX_MEMORY_ENTRIES = 1000;
const memory = new Map<string, { value: string; expiresAt: number }>();

const memoryGet = (key: string): string | null => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  // Refresh recency
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
};

const memorySet = (key: string, value: string, ttlSeconds: number) => {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
};

const globToRegExp = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const client = activeRedis();
    const data = client ? await client.get(key) : memoryGet(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds = 3600): Promise<void> => {
  try {
    const serialized = JSON.stringify(value);
    const client = activeRedis();
    if (client) await client.setex(key, ttlSeconds, serialized);
    else memorySet(key, serialized, ttlSeconds);
  } catch {
    /* cache failures never break requests */
  }
};

export const cacheDel = async (pattern: string): Promise<void> => {
  try {
    const client = activeRedis();
    if (client) {
      // SCAN instead of KEYS so large caches don't block Redis
      let cursor = "0";
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 200);
        cursor = next;
        if (keys.length) await client.del(...keys);
      } while (cursor !== "0");
      return;
    }
    const matcher = globToRegExp(pattern);
    for (const key of [...memory.keys()]) if (matcher.test(key)) memory.delete(key);
  } catch {
    /* ignore */
  }
};

/** Atomic counter with expiry, used for per-user daily AI quotas. */
export const cacheIncr = async (key: string, ttlSeconds: number): Promise<number> => {
  const client = activeRedis();
  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, ttlSeconds);
      return count;
    } catch {
      /* fall through to memory */
    }
  }
  const current = Number(memoryGet(key) ?? 0) + 1;
  const entry = memory.get(key);
  memorySet(key, String(current), entry ? Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000)) : ttlSeconds);
  return current;
};
