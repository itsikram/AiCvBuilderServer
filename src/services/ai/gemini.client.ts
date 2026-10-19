import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { config } from "../../config/index.js";
import { ApiError } from "../../utils/ApiError.js";
import { geminiKeyManager } from "./gemini-key-manager.js";
import type { AiSchema } from "./schema.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Never let an API key reach logs. */
const redact = (text: string) => text.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-key]");

type Failure =
  | { kind: "rate_limit" }
  | { kind: "key_rejected"; reason: string }
  | { kind: "model_unavailable" }
  | { kind: "retryable" }
  | { kind: "fatal"; status?: number };

/** Classifies SDK/network errors into what the retry loop should do. */
export const classifyGeminiError = (error: unknown): Failure => {
  const status = (error as { status?: number }).status;
  const message = String((error as Error)?.message ?? error).toLowerCase();
  const name = (error as Error)?.name ?? "";

  if (status === 429 || message.includes("resource_exhausted") || message.includes("quota")) return { kind: "rate_limit" };
  if (message.includes("api key not valid") || message.includes("api_key_invalid")) return { kind: "key_rejected", reason: "invalid key" };
  if (message.includes("reported as leaked")) return { kind: "key_rejected", reason: "key reported as leaked; revoke it" };
  if (status === 403 || message.includes("permission_denied") || message.includes("denied access")) {
    return { kind: "key_rejected", reason: "permission denied for this key's project" };
  }
  if (status === 404 || message.includes("no longer available") || message.includes("not found for api version")) {
    return { kind: "model_unavailable" };
  }
  if (
    (status !== undefined && status >= 500) ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up")
  ) {
    return { kind: "retryable" };
  }
  return { kind: "fatal", status };
};

const clientCache = new Map<string, GoogleGenAI>();
const clientFor = (key: string) => {
  let client = clientCache.get(key);
  if (!client) {
    client = new GoogleGenAI({ apiKey: key });
    clientCache.set(key, client);
  }
  return client;
};

/** Low/no thinking keeps flash-lite fast and cheap for short structured writing tasks. */
const thinkingConfigFor = (model: string): GenerateContentConfig["thinkingConfig"] | undefined => {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-(3|flash|pro)/.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL };
  return undefined;
};

export interface GenerateJsonOptions<T> {
  system: string;
  prompt: string;
  schema: AiSchema<T>;
  temperature?: number;
  maxOutputTokens?: number;
  /** For logs and metrics only */
  task: string;
}

const userMessages = {
  notConfigured: "AI features are not available right now. Please try again later.",
  busy: "The AI service is busy right now. Please try again in a minute.",
  failed: "The AI couldn't complete this request. Please try again.",
  invalidOutput: "The AI returned an unexpected answer. Please try again.",
};

/**
 * Calls Gemini with structured JSON output and validates the result against the
 * schema. Retries 429/5xx/timeouts with exponential backoff and jitter, rotates
 * keys, disables rejected keys, and falls back to GEMINI_FALLBACK_MODEL when the
 * primary model is unavailable. Errors reaching users never include provider details.
 */
export async function generateJson<T>(options: GenerateJsonOptions<T>): Promise<T> {
  if (geminiKeyManager.total === 0) throw new ApiError(503, userMessages.notConfigured);

  const models = [config.gemini.model, config.gemini.fallbackModel].filter(
    (m, i, all): m is string => Boolean(m) && all.indexOf(m) === i
  );
  let modelIndex = 0;
  const maxAttempts = Math.max(1, config.gemini.maxRetries + 1) + geminiKeyManager.total;
  const triedKeys = new Set<number>();
  let backoffMs = 800;
  let invalidOutputs = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let picked = geminiKeyManager.next(triedKeys);
    if (!picked) {
      // Every key was tried or is cooling down; wait for the soonest one if it's short
      triedKeys.clear();
      const wait = geminiKeyManager.msUntilAvailable();
      if (!Number.isFinite(wait) || wait > 15_000) break;
      await sleep(wait + Math.random() * 250);
      picked = geminiKeyManager.next(triedKeys);
      if (!picked) break;
    }

    const model = models[modelIndex];
    const started = Date.now();
    try {
      const response = await clientFor(picked.key).models.generateContent({
        model,
        contents: options.prompt,
        config: {
          systemInstruction: options.system,
          responseMimeType: "application/json",
          responseJsonSchema: options.schema.json,
          temperature: options.temperature ?? 0.4,
          maxOutputTokens: options.maxOutputTokens ?? 2048,
          thinkingConfig: thinkingConfigFor(model),
          httpOptions: { timeout: config.gemini.timeoutMs },
        },
      });

      const text = response.text ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      const result = options.schema.zod.safeParse(parsed);
      if (!result.success) {
        invalidOutputs += 1;
        console.warn(`[ai] ${options.task}: invalid structured output from ${model} (attempt ${attempt + 1})`);
        if (invalidOutputs >= 2) throw new ApiError(502, userMessages.invalidOutput);
        continue;
      }

      geminiKeyManager.recordSuccess(picked.index);
      const usage = response.usageMetadata;
      console.log(
        `[ai] ${options.task} ok model=${model} key=#${picked.index} ${Date.now() - started}ms tokens=${usage?.promptTokenCount ?? "?"}/${usage?.candidatesTokenCount ?? "?"}`
      );
      return result.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const failure = classifyGeminiError(error);
      const status = (error as { status?: number }).status;
      console.warn(`[ai] ${options.task} failed model=${model} key=#${picked.index} status=${status ?? "-"} kind=${failure.kind}: ${redact(String((error as Error)?.message ?? error)).slice(0, 200)}`);

      switch (failure.kind) {
        case "rate_limit":
          geminiKeyManager.markRateLimited(picked.index);
          triedKeys.add(picked.index);
          break;
        case "key_rejected":
          geminiKeyManager.disable(picked.index, failure.reason);
          triedKeys.add(picked.index);
          break;
        case "model_unavailable":
          if (modelIndex < models.length - 1) {
            modelIndex += 1;
            console.warn(`[ai] model ${model} unavailable, falling back to ${models[modelIndex]}`);
          } else {
            throw new ApiError(503, userMessages.notConfigured);
          }
          break;
        case "retryable":
          geminiKeyManager.recordFailure(picked.index);
          await sleep(backoffMs + Math.random() * backoffMs);
          backoffMs = Math.min(backoffMs * 2, 8000);
          break;
        case "fatal":
          throw new ApiError(502, userMessages.failed);
      }
    }
  }

  throw new ApiError(503, userMessages.busy);
}
