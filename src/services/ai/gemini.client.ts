import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../../config/index.js";
import { ApiError } from "../../utils/ApiError.js";
import { geminiKeyManager } from "./gemini-key-manager.js";
import { integrations } from "../settings.service.js";
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

const isTimeout = (error: unknown) => {
  const name = (error as Error)?.name ?? "";
  return name === "AbortError" || name === "TimeoutError" || /timeout|timed out|aborted/i.test(String((error as Error)?.message ?? ""));
};

const clientCache = new Map<string, GoogleGenAI>();
const clientFor = (key: string, baseUrl: string) => {
  const cacheKey = `${baseUrl}|${key}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    // GEMINI_BASE_URL is optional (an API gateway/proxy, or a local stub in tests)
    client = new GoogleGenAI({ apiKey: key, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
    clientCache.set(cacheKey, client);
  }
  return client;
};

/** Gemini 3 and later (and the -latest aliases), which want their default temperature. */
const isGemini3 = (model: string) => {
  const major = /^gemini-(\d+)/.exec(model)?.[1];
  return major ? Number(major) >= 3 : /^gemini-(flash|pro)/.test(model);
};

/**
 * Google asks to keep Gemini 3 models at their default temperature (1.0): lower values
 * can make them loop, which fills the output limit and cuts the JSON off. Older models
 * get the task's temperature.
 */
const temperatureFor = (model: string, requested: number | undefined) => (isGemini3(model) ? undefined : requested ?? 0.4);

/** Low/no thinking keeps flash-lite fast and cheap for short structured writing tasks. */
const thinkingConfigFor = (model: string): GenerateContentConfig["thinkingConfig"] | undefined => {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-(3|flash|pro)/.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL };
  return undefined;
};

/**
 * Models that answered "not found / no longer available", with when they did. Google retires
 * model ids (gemini-2.5-flash-lite stopped working in Oct 2026), so a stale GEMINI_MODEL
 * would otherwise cost a failed call on every request. The skip expires so the model chosen
 * in Admin -> Settings is tried again (e.g. after the key gains access) without a restart.
 */
const unavailableModels = new Map<string, number>();
const UNAVAILABLE_MODEL_SKIP_MS = 30 * 60_000;

const isUnavailable = (model: string) => {
  const since = unavailableModels.get(model);
  if (since === undefined) return false;
  if (Date.now() - since < UNAVAILABLE_MODEL_SKIP_MS) return true;
  unavailableModels.delete(model);
  return false;
};

/** GEMINI_MODEL, then GEMINI_FALLBACK_MODEL, then the built-in default, skipping retired ones. */
const modelChain = (settings: { model: string; fallbackModel: string }) => {
  const all = [settings.model, settings.fallbackModel, DEFAULT_GEMINI_MODEL].filter(
    (m, i, list): m is string => Boolean(m) && list.indexOf(m) === i
  );
  const usable = all.filter((m) => !isUnavailable(m));
  return usable.length > 0 ? usable : all;
};

export interface GenerateJsonOptions<T> {
  system: string;
  prompt: string;
  schema: AiSchema<T>;
  /** Used by models before Gemini 3 only (see temperatureFor) */
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Per-attempt time limit for long answers (CV import, translation); the
   * GEMINI_TIMEOUT_MS setting applies when it is higher.
   */
  attemptTimeoutMs?: number;
  /**
   * Total time for the call, retries included, so the user gets a clear message before
   * the browser gives up (the client waits 120 s for AI tools, 180 s for imports).
   */
  deadlineMs?: number;
  /** For logs and metrics only */
  task: string;
}

const DEFAULT_DEADLINE_MS = 110_000;
/** Output room when an answer was cut off at maxOutputTokens */
const MAX_OUTPUT_TOKENS_CAP = 32_768;

const userMessages = {
  notConfigured: "AI features are not available right now. Please try again later.",
  busy: "The AI service is busy right now. Please try again in a minute.",
  failed: "The AI couldn't complete this request. Please try again.",
  invalidOutput: "The AI returned an unexpected answer. Please try again.",
  tooSlow: "The AI took too long to answer. Please try again, or with a shorter text.",
};

/**
 * Calls Gemini with structured JSON output and validates the result against the
 * schema. Retries 429/5xx/timeouts with exponential backoff and jitter, rotates
 * keys, disables rejected keys, and falls back to GEMINI_FALLBACK_MODEL and then the
 * built-in default model when the primary model is unavailable. Errors reaching users never include provider details.
 */
export async function generateJson<T>(options: GenerateJsonOptions<T>): Promise<T> {
  await geminiKeyManager.refresh();
  if (geminiKeyManager.total === 0) throw new ApiError(503, userMessages.notConfigured);

  const settings = await integrations.gemini();
  const models = modelChain(settings);
  let modelIndex = 0;
  const maxAttempts = Math.max(1, settings.maxRetries + 1) + geminiKeyManager.total;
  const triedKeys = new Set<number>();
  let backoffMs = 800;
  let invalidOutputs = 0;
  let maxOutputTokens = options.maxOutputTokens ?? 2048;
  const attemptTimeoutMs = Math.max(settings.timeoutMs, options.attemptTimeoutMs ?? 0);
  const deadline = Date.now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS);
  let timedOut = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Leave the last seconds for the response to reach the browser
    const timeLeft = deadline - Date.now() - 2000;
    if (timeLeft < 5000) break;

    let picked = geminiKeyManager.next(triedKeys);
    if (!picked) {
      // Every key was tried or is cooling down; wait for the soonest one if it's short
      triedKeys.clear();
      const wait = geminiKeyManager.msUntilAvailable();
      // Every key is rejected (invalid/leaked): retrying later won't help
      if (!Number.isFinite(wait)) throw new ApiError(503, userMessages.notConfigured);
      if (wait > 15_000) break;
      await sleep(wait + Math.random() * 250);
      picked = geminiKeyManager.next(triedKeys);
      if (!picked) break;
    }

    const model = models[modelIndex];
    const started = Date.now();
    try {
      const response = await clientFor(picked.key, settings.baseUrl).models.generateContent({
        model,
        contents: options.prompt,
        config: {
          systemInstruction: options.system,
          responseMimeType: "application/json",
          responseJsonSchema: options.schema.json,
          temperature: temperatureFor(model, options.temperature),
          maxOutputTokens,
          thinkingConfig: thinkingConfigFor(model),
          httpOptions: { timeout: Math.min(attemptTimeoutMs, timeLeft) },
        },
      });

      const text = response.text ?? "";
      const finishReason = response.candidates?.[0]?.finishReason;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      const result = options.schema.zod.safeParse(parsed);
      if (!result.success) {
        invalidOutputs += 1;
        // The answer's content is not logged: it can hold a user's CV
        console.warn(
          `[ai] ${options.task}: invalid structured output from ${model} (attempt ${attempt + 1}, finish=${finishReason ?? "?"}, ${text.length} chars, ${parsed === undefined ? "not JSON" : "schema mismatch"})`
        );
        if (finishReason === "MAX_TOKENS" && maxOutputTokens < MAX_OUTPUT_TOKENS_CAP) {
          // Cut off mid-answer: give the next attempt more room (does not count as a bad answer)
          maxOutputTokens = Math.min(MAX_OUTPUT_TOKENS_CAP, maxOutputTokens * 2);
          invalidOutputs -= 1;
          continue;
        }
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
          unavailableModels.set(model, Date.now());
          if (modelIndex < models.length - 1) {
            modelIndex += 1;
            console.warn(`[ai] model ${model} unavailable, falling back to ${models[modelIndex]}`);
          } else {
            throw new ApiError(503, userMessages.notConfigured);
          }
          break;
        case "retryable":
          geminiKeyManager.recordFailure(picked.index);
          if (isTimeout(error)) timedOut = true;
          await sleep(Math.min(backoffMs + Math.random() * backoffMs, Math.max(0, deadline - Date.now() - 7000)));
          backoffMs = Math.min(backoffMs * 2, 8000);
          break;
        case "fatal":
          throw new ApiError(502, userMessages.failed);
      }
    }
  }

  throw timedOut ? new ApiError(504, userMessages.tooSlow) : new ApiError(503, userMessages.busy);
}

const testProblems: Record<Failure["kind"], (model: string) => string> = {
  rate_limit: () => "Rate limited or out of quota. Check billing and quota for this key's project in Google AI Studio.",
  key_rejected: () => "Key rejected",
  model_unavailable: (model) => `Model "${model}" is not available to this key. Change the Model setting.`,
  retryable: () => "Gemini did not answer (timeout or server error). Try again.",
  fatal: () => "Gemini rejected the request",
};

/**
 * Sends one tiny request per key with the configured model (Admin -> Settings -> Test).
 * Keys that work are put back in rotation; the result never includes a key.
 */
export async function testGeminiKeys() {
  await geminiKeyManager.refresh();
  const settings = await integrations.gemini();
  return Promise.all(
    geminiKeyManager.all().map(async ({ key, index }) => {
      const started = Date.now();
      try {
        await clientFor(key, settings.baseUrl).models.generateContent({
          model: settings.model,
          contents: "Reply with OK.",
          config: {
            maxOutputTokens: 16,
            thinkingConfig: thinkingConfigFor(settings.model),
            httpOptions: { timeout: settings.timeoutMs },
          },
        });
        geminiKeyManager.reset(index);
        return { index, ok: true as const, model: settings.model, ms: Date.now() - started };
      } catch (error) {
        const failure = classifyGeminiError(error);
        const problem = failure.kind === "key_rejected" ? `Key rejected: ${failure.reason}` : testProblems[failure.kind](settings.model);
        return {
          index,
          ok: false as const,
          model: settings.model,
          problem,
          detail: redact(String((error as Error)?.message ?? error)).slice(0, 300),
        };
      }
    })
  );
}
