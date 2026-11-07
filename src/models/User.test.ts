import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionOf, trialEnded, type User } from "./User.js";

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

test("paid Premium and Free are reported as stored", () => {
  const paid = user({ subscriptionPlan: "premium", subscriptionStatus: "active", subscriptionExpiresAt: new Date(Date.now() - HOUR) });
  assert.equal(trialEnded(paid), false);
  assert.equal(subscriptionOf(paid).plan, "premium");
  assert.equal(subscriptionOf(user({})).plan, "free");
});
