import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifiesForAutoAdmin } from "./autoAdmin.js";

const owners = ["mdikram295@gmail.com"];
const owner = { role: "user", email: "mdikram295@gmail.com", isEmailVerified: true };

test("a verified owner email qualifies, whatever its case", () => {
  assert.equal(qualifiesForAutoAdmin(owner, owners), true);
  assert.equal(qualifiesForAutoAdmin({ ...owner, email: " MDIkram295@Gmail.com " }, owners), true);
});

test("an unverified owner email does not qualify", () => {
  assert.equal(qualifiesForAutoAdmin({ ...owner, isEmailVerified: false }, owners), false);
});

test("other emails and existing admins do not qualify", () => {
  assert.equal(qualifiesForAutoAdmin({ ...owner, email: "someone@gmail.com" }, owners), false);
  assert.equal(qualifiesForAutoAdmin({ ...owner, role: "admin" }, owners), false);
});
