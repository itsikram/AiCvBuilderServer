import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Stub Gemini endpoint that records each request and answers from a script
type Answer = { text: string; finishReason?: string };
const requests: Array<{ url: string; body: Record<string, any> }> = [];
const script: Answer[] = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    requests.push({ url: req.url ?? "", body: JSON.parse(raw || "{}") });
    const answer = script.shift() ?? { text: '{"items":["a"],"score":5}' };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer.text }] }, finishReason: answer.finishReason ?? "STOP" }] }));
  });
});
await new Promise<void>((resolve) => server.listen(0, resolve));

process.env.GEMINI_API_KEYS = "test-key";
process.env.GEMINI_MODEL = "gemini-3.5-flash";
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const { prisma, disconnectDatabase } = await import("../../config/database.js");
(prisma.adminSetting as unknown as { findMany: () => Promise<never[]> }).findMany = async () => [];
const { generateJson } = await import("./gemini.client.js");
const { S } = await import("./schema.js");

const schema = S.object({ items: S.array(S.string(undefined, 20), 3), score: S.number("0-100", 0, 100) });
const config = () => requests.at(-1)!.body.generationConfig as Record<string, any>;

test.after(async () => {
  server.closeAllConnections();
  server.close();
  await disconnectDatabase();
});

test("Gemini 3 models get their default temperature and a schema without limits", async () => {
  requests.length = 0;
  await generateJson({ system: "s", prompt: "p", task: "test", schema, temperature: 0 });
  assert.equal(config().temperature, undefined);
  const json = JSON.stringify(config().responseJsonSchema);
  assert.doesNotMatch(json, /maxItems|minimum|maximum/);
});

test("limits are applied to the answer instead: arrays trimmed, numbers clamped", async () => {
  script.push({ text: '{"items":["1","2","3","4","5"],"score":250}' });
  assert.deepEqual(await generateJson({ system: "s", prompt: "p", task: "test", schema }), { items: ["1", "2", "3"], score: 100 });
});

test("an answer cut off at the output limit is retried with more room", async () => {
  requests.length = 0;
  script.push({ text: '{"items":["a","b"', finishReason: "MAX_TOKENS" }, { text: '{"items":["a","b"],"score":7}' });
  const result = await generateJson({ system: "s", prompt: "p", task: "test", schema, maxOutputTokens: 1000 });
  assert.deepEqual(result, { items: ["a", "b"], score: 7 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.generationConfig.maxOutputTokens, 1000);
  assert.equal(requests[1].body.generationConfig.maxOutputTokens, 2000);
});

test("older models keep the task's temperature", async () => {
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  try {
    const { invalidateSettings } = await import("../settings.service.js");
    invalidateSettings();
    requests.length = 0;
    await generateJson({ system: "s", prompt: "p", task: "test", schema, temperature: 0.2 });
    assert.match(requests[0].url, /gemini-2\.5-flash/);
    assert.equal(config().temperature, 0.2);
  } finally {
    process.env.GEMINI_MODEL = "gemini-3.5-flash";
  }
});
