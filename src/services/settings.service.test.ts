import { test } from "node:test";
import assert from "node:assert/strict";

// No database: stub the two tables the settings code reads
const saved = new Map<string, string>();
const { prisma, disconnectDatabase } = await import("../config/database.js");
(prisma.adminSetting as unknown as { findMany: () => Promise<Array<{ key: string; value: string }>> }).findMany = async () =>
  [...saved].map(([key, value]) => ({ key, value }));
(prisma.subscriptionPlan as unknown as { findUnique: () => Promise<null> }).findUnique = async () => null;

const settings = await import("./settings.service.js");
const { getSetting, getIntSetting, resolveDefault, settingSource, integrations, invalidateSettings, SETTING_DEFINITIONS } = settings;

test.after(() => disconnectDatabase());

test("every setting has a default, or an example when the value is account-specific or secret", () => {
  for (const definition of SETTING_DEFINITIONS) {
    const hasDefault = definition.default !== undefined;
    const accountSpecific = definition.type === "secret" || definition.placeholder !== undefined;
    assert.ok(hasDefault || accountSpecific, `${definition.key} has neither a default nor a placeholder`);
  }
});

test("defaults apply when nothing is saved or set in the environment", async () => {
  delete process.env.GEMINI_TIMEOUT_MS;
  assert.equal(await getSetting("GEMINI_TIMEOUT_MS"), "30000");
  assert.equal(await settingSource("GEMINI_TIMEOUT_MS"), "default");
  assert.equal(await getIntSetting("GEMINI_MAX_RETRIES", 99), 3);
  assert.equal((await integrations.email()).port, 587);
  assert.equal((await integrations.sslcommerz()).isLive, false);
});

test("a saved value wins over the environment, which wins over the default", async () => {
  process.env.SMTP_PORT = "465";
  assert.equal(await getSetting("SMTP_PORT"), "465");
  assert.equal(await settingSource("SMTP_PORT"), "env");
  saved.set("SMTP_PORT", "2525");
  invalidateSettings();
  assert.equal(await getSetting("SMTP_PORT"), "2525");
  assert.equal(await settingSource("SMTP_PORT"), "database");
  saved.delete("SMTP_PORT");
  delete process.env.SMTP_PORT;
  invalidateSettings();
});

test("plan limits default to the built-in plan values when no plan row exists", async () => {
  assert.equal(await resolveDefault("MAX_RESUMES_FREE"), "2");
  assert.equal(await resolveDefault("MAX_RESUMES_PREMIUM"), "-1");
  // Derived defaults are not returned by getSetting, so callers keep their own fallback
  assert.equal(await getSetting("MAX_RESUMES_FREE"), undefined);
});

test("the default IPN URL uses the API's public origin", async () => {
  delete process.env.SSL_IPN_URL;
  assert.equal(await resolveDefault("SSL_IPN_URL"), "");
  assert.equal(await settingSource("SSL_IPN_URL"), "none");
  const ssl = await integrations.sslcommerz({ apiOrigin: "https://api.example.com" });
  assert.equal(ssl.ipnUrl, "https://api.example.com/api/v1/payments/sslcommerz/ipn");
  assert.match(ssl.successUrl, /\/dashboard\/billing\?payment=success$/);
});
