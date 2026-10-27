import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";

// Stub Gemini endpoint: the retired model answers 404, the default model answers JSON
const calls: string[] = [];
const server = http.createServer((req, res) => {
  calls.push(req.url ?? "");
  req.resume();
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("gemini-2.5-flash-lite")) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 404, message: "This model models/gemini-2.5-flash-lite is no longer available.", status: "NOT_FOUND" } }));
      return;
    }
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }] }));
  });
});
await new Promise<void>((resolve) => server.listen(0, resolve));

process.env.GEMINI_API_KEYS = "test-key";
process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const { generateJson } = await import("./gemini.client.js");

const schema = { zod: z.object({ summary: z.string() }), json: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } };

test("a retired GEMINI_MODEL falls back to the default model and is skipped afterwards", async (t) => {
  t.after(() => server.close());

  assert.deepEqual(await generateJson({ system: "s", prompt: "p", task: "test", schema }), { summary: "ok" });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /gemini-2\.5-flash-lite/);
  assert.match(calls[1], /gemini-3\.5-flash-lite/);

  calls.length = 0;
  await generateJson({ system: "s", prompt: "p", task: "test", schema });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /gemini-3\.5-flash-lite/);
});
