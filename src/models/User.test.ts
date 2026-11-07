import { test } from "node:test";
import assert from "node:assert/strict";
import { premiumEnded, subscriptionOf, trialEnded, type User } from "./User.js";

const HOUR = 60 * 60 * 1000;
const user = (fields: Partial<User>) =>
  ({ subscriptionPlan: "free", subscriptionStatus: "active", subscriptionExpiresAt: null, ...fields }) as User;

test("a running trial is Premium until its end date", () => {
  const onTrial = user({ subscriptionPlan: "premium", subscriptionStatus: "trial", subscriptionExpiresAt: new Date(Date.now() + HOUR) });
  assert.equal(trialEnded(onTrial), false);
  assert.deepEqual(subscriptionOf(onTrial), { plan: "premium", status: "trial", expiresAt: onTrial.subscriptionExpiresAt });
});

test("a trial past its end date reports as the Free plan", () => {
  const ended = user({ subscriptionPlan: "premium", subscriptionStatus: "trial", subscriptionExpiresAt: new Date(Date.now() - 1000) });
  assert.equal(trialEnded(ended), true);
  assert.deepEqual(subscriptionOf(ended), { plan: "free", status: "active", expiresAt: undefined });
});

test("a trial without an end date counts as ended", () => {
  assert.equal(trialEnded(user({ subscriptionPlan: "premium", subscriptionStatus: "trial" })), true);
});

test("paid Premium is Premium until its end date, then Free", () => {
  const running = user({ subscriptionPlan: "premium", subscriptionStatus: "active", subscriptionExpiresAt: new Date(Date.now() + HOUR) });
  assert.equal(premiumEnded(running), false);
  assert.equal(subscriptionOf(running).plan, "premium");
  const ended = user({ subscriptionPlan: "premium", subscriptionStatus: "active", subscriptionExpiresAt: new Date(Date.now() - HOUR) });
  assert.equal(trialEnded(ended), false);
  assert.equal(premiumEnded(ended), true);
  assert.deepEqual(subscriptionOf(ended), { plan: "free", status: "active", expiresAt: undefined });
});

test("Premium granted without an end date never ends; Free is reported as stored", () => {
  const forever = user({ subscriptionPlan: "premium", subscriptionStatus: "active" });
  assert.equal(premiumEnded(forever), false);
  assert.equal(subscriptionOf(forever).plan, "premium");
  assert.equal(subscriptionOf(user({})).plan, "free");
  assert.equal(premiumEnded(user({ subscriptionExpiresAt: new Date(Date.now() - HOUR) })), false);
});
