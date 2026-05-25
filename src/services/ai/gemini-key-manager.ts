import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/index.js";
import { cacheGet, cacheSet } from "../../config/redis.js";

interface KeyStatus {
  key: string;
  index: number;
  isLimited: boolean;
  limitExpireAt?: number;
  failureCount: number;
  lastUsedAt: number;
}

class GeminiKeyManager {
  private keyStatuses: KeyStatus[] = [];
  private currentKeyIndex: number = 0;
  private readonly RATE_LIMIT_RESET_MS = 60000; // 1 minute
  private readonly RATE_LIMIT_CACHE_PREFIX = "gemini_rate_limit:";
  private readonly MAX_FAILURES_BEFORE_LIMIT = 3;

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    const keys = config.gemini.apiKeys || [];
    if (keys.length === 0) {
      console.warn("No Gemini API keys configured");
      return;
    }

    this.keyStatuses = keys.map((key, index) => ({
      key,
      index,
      isLimited: false,
      failureCount: 0,
      lastUsedAt: 0,
    }));

    console.log(`Initialized ${keys.length} Gemini API key(s)`);
  }

  private async checkKeyStatus(keyIndex: number): Promise<void> {
    const keyStatus = this.keyStatuses[keyIndex];
    if (!keyStatus) return;

    const cacheKey = `${this.RATE_LIMIT_CACHE_PREFIX}${keyIndex}`;
    const cachedLimit = await cacheGet<boolean>(cacheKey);

    if (cachedLimit) {
      keyStatus.isLimited = true;
      console.log(`Key ${keyIndex} is rate limited (from cache)`);
    } else if (keyStatus.isLimited && keyStatus.limitExpireAt && Date.now() >= keyStatus.limitExpireAt) {
      keyStatus.isLimited = false;
      keyStatus.failureCount = 0;
      console.log(`Key ${keyIndex} rate limit expired, resuming`);
    }
  }

  private async markKeyLimited(keyIndex: number): Promise<void> {
    const keyStatus = this.keyStatuses[keyIndex];
    if (!keyStatus) return;

    keyStatus.isLimited = true;
    keyStatus.limitExpireAt = Date.now() + this.RATE_LIMIT_RESET_MS;
    keyStatus.failureCount = 0;

    const cacheKey = `${this.RATE_LIMIT_CACHE_PREFIX}${keyIndex}`;
    await cacheSet(cacheKey, true, Math.ceil(this.RATE_LIMIT_RESET_MS / 1000));

    console.warn(
      `Key ${keyIndex} marked as limited for ${this.RATE_LIMIT_RESET_MS}ms. Switching to next key.`
    );
  }

  private recordFailure(keyIndex: number): void {
    const keyStatus = this.keyStatuses[keyIndex];
    if (!keyStatus) return;

    keyStatus.failureCount++;
    if (keyStatus.failureCount >= this.MAX_FAILURES_BEFORE_LIMIT) {
      console.warn(
        `Key ${keyIndex} has ${keyStatus.failureCount} failures, marking as limited`
      );
    }
  }

  private getNextAvailableKeyIndex(): number {
    const availableKeys = this.keyStatuses.filter((ks) => !ks.isLimited);

    if (availableKeys.length === 0) {
      console.warn("No available API keys, using first key anyway");
      return 0;
    }

    // Find the key with oldest lastUsedAt to balance load
    let nextKey = availableKeys[0];
    for (const key of availableKeys) {
      if (key.lastUsedAt < nextKey.lastUsedAt) {
        nextKey = key;
      }
    }

    return nextKey.index;
  }

  async getNextClient(): Promise<{ client: GoogleGenerativeAI; keyIndex: number }> {
    // Check status of all keys
    for (let i = 0; i < this.keyStatuses.length; i++) {
      await this.checkKeyStatus(i);
    }

    const keyIndex = this.getNextAvailableKeyIndex();
    const keyStatus = this.keyStatuses[keyIndex];

    if (!keyStatus || !keyStatus.key) {
      throw new Error("No Gemini API keys available");
    }

    keyStatus.lastUsedAt = Date.now();
    const client = new GoogleGenerativeAI(keyStatus.key);

    return { client, keyIndex };
  }

  async handleError(keyIndex: number, error: unknown): Promise<void> {
    const keyStatus = this.keyStatuses[keyIndex];
    if (!keyStatus) return;

    const errorStr = String(error);
    const errorLower = errorStr.toLowerCase();

    // Check for rate limit errors
    if (
      errorLower.includes("resource_exhausted") ||
      errorLower.includes("rate_limit") ||
      errorLower.includes("quota") ||
      errorLower.includes("429")
    ) {
      await this.markKeyLimited(keyIndex);
    } else {
      // Record other failures
      this.recordFailure(keyIndex);
    }
  }

  getKeyStats(): Array<{ index: number; isLimited: boolean; failureCount: number; lastUsedAt: number }> {
    return this.keyStatuses.map((ks) => ({
      index: ks.index,
      isLimited: ks.isLimited,
      failureCount: ks.failureCount,
      lastUsedAt: ks.lastUsedAt,
    }));
  }

  getAvailableKeyCount(): number {
    return this.keyStatuses.filter((ks) => !ks.isLimited).length;
  }
}

export const geminiKeyManager = new GeminiKeyManager();
