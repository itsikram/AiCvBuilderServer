import { config } from "../../config/index.js";

/**
 * Rotates between GEMINI_API_KEYS. Keys are read only from the environment and
 * are never logged or returned by any API: status reports use the key's index.
 *
 * - Rate-limited keys (HTTP 429) cool down for a minute.
 * - Rejected keys (invalid, revoked, reported as leaked, project denied) are
 *   disabled for 6 hours, so one bad key no longer slows every request.
 */
interface KeyState {
  index: number;
  key: string;
  cooldownUntil: number;
  disabledUntil: number;
  disabledReason?: string;
  failures: number;
  lastUsedAt: number;
}

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const DISABLE_MS = 6 * 60 * 60_000;

class GeminiKeyManager {
  private keys: KeyState[] = config.gemini.apiKeys.map((key, index) => ({
    index,
    key,
    cooldownUntil: 0,
    disabledUntil: 0,
    failures: 0,
    lastUsedAt: 0,
  }));

  constructor() {
    if (this.keys.length === 0) console.warn("No Gemini API keys configured (set GEMINI_API_KEYS)");
    else console.log(`Gemini: ${this.keys.length} API key(s) configured`);
  }

  get total() {
    return this.keys.length;
  }

  private usable(now = Date.now()) {
    return this.keys.filter((k) => k.disabledUntil <= now && k.cooldownUntil <= now);
  }

  /** Least-recently-used healthy key, excluding keys already tried for this request. */
  next(exclude: Set<number> = new Set()): { key: string; index: number } | null {
    const candidates = this.usable().filter((k) => !exclude.has(k.index));
    if (candidates.length === 0) return null;
    const chosen = candidates.reduce((a, b) => (b.lastUsedAt < a.lastUsedAt ? b : a));
    chosen.lastUsedAt = Date.now();
    return { key: chosen.key, index: chosen.index };
  }

  /** Milliseconds until some key can be used again (0 if one is ready, Infinity if none ever will). */
  msUntilAvailable(): number {
    const now = Date.now();
    const enabled = this.keys.filter((k) => k.disabledUntil <= now);
    if (enabled.length === 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(...enabled.map((k) => k.cooldownUntil - now)));
  }

  markRateLimited(index: number) {
    const key = this.keys[index];
    if (!key) return;
    key.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    console.warn(`Gemini key #${index} rate limited; cooling down for ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
  }

  disable(index: number, reason: string) {
    const key = this.keys[index];
    if (!key) return;
    key.disabledUntil = Date.now() + DISABLE_MS;
    key.disabledReason = reason;
    console.error(`Gemini key #${index} disabled for 6h: ${reason}. Replace it in GEMINI_API_KEYS.`);
  }

  recordFailure(index: number) {
    const key = this.keys[index];
    if (key) key.failures += 1;
  }

  recordSuccess(index: number) {
    const key = this.keys[index];
    if (key) key.failures = 0;
  }

  getKeyStats() {
    const now = Date.now();
    return this.keys.map((k) => ({
      index: k.index,
      status: k.disabledUntil > now ? "disabled" : k.cooldownUntil > now ? "rate_limited" : "active",
      disabledReason: k.disabledUntil > now ? k.disabledReason : undefined,
      isLimited: k.disabledUntil > now || k.cooldownUntil > now,
      failureCount: k.failures,
      lastUsedAt: k.lastUsedAt,
    }));
  }

  getAvailableKeyCount() {
    return this.usable().length;
  }
}

export const geminiKeyManager = new GeminiKeyManager();
