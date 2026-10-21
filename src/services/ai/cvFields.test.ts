import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTextUpdates, collectTextFields, fieldsToPrompt, getAtPath } from "./cvFields.js";

const content = {
  personalInfo: { fullName: "Rahim Uddin", email: "rahim@example.com", phone: "", location: "Dhaka", summary: "Hard working graduate." },
  careerObjective: "To work in a reputed company.",
  personalDetails: { fatherName: "Karim Uddin", nid: "1234567890" },
  experience: [{ id: "a", company: "BRAC", position: "Intern", startDate: "2024-01", current: false, bullets: ["Helped team", ""] }],
  education: [{ id: "b", institution: "Dhaka College", degree: "HSC", startDate: "", level: "hsc", gpa: "5.00" }],
  skills: ["Excel", "  "],
  interests: [],
};

test("prose scope keeps only sentences", () => {
  const paths = collectTextFields(content, "prose").map((f) => f.path);
  assert.deepEqual(paths, ["personalInfo.summary", "careerObjective", "experience.0.bullets.0"]);
});

test("all scope adds titles, names and skills but never ids, emails, dates or NID", () => {
  const fields = collectTextFields(content, "all");
  const paths = fields.map((f) => f.path);
  assert.ok(paths.includes("personalInfo.fullName"));
  assert.ok(paths.includes("personalDetails.fatherName"));
  assert.ok(paths.includes("experience.0.company"));
  assert.ok(paths.includes("education.0.degree"));
  assert.ok(paths.includes("skills.0"));
  assert.ok(!paths.some((p) => /email|startDate|nid|gpa|\.id$/.test(p)), paths.join(","));
  assert.ok(!paths.includes("skills.1"), "blank values are skipped");
  assert.equal(fields.find((f) => f.path === "experience.0.company")?.name, true);
  assert.deepEqual(fields.map((f) => f.id), fields.map((_, i) => `f${i}`));
});

test("fieldsToPrompt marks names and flattens newlines", () => {
  const text = fieldsToPrompt([
    { id: "f0", path: "personalInfo.fullName", text: "Rahim", name: true },
    { id: "f1", path: "careerObjective", text: "Line one\n  line two" },
  ]);
  assert.equal(text, "f0 (name): Rahim\nf1: Line one / line two");
});

test("applyTextUpdates changes existing strings only and does not mutate the input", () => {
  const updated = applyTextUpdates(content, [
    { path: "experience.0.bullets.0", text: "Supported a team of five" },
    { path: "careerObjective", text: "New objective" },
    { path: "experience.0.current", text: "yes" }, // boolean: ignored
    { path: "experience.3.position", text: "x" }, // missing entry: ignored
    { path: "__proto__.polluted", text: "x" }, // unsafe: ignored
    { path: "personalInfo.newField", text: "x" }, // not an existing string: ignored
  ]);
  assert.equal(getAtPath(updated, "experience.0.bullets.0"), "Supported a team of five");
  assert.equal(updated.careerObjective, "New objective");
  assert.equal(updated.experience[0].current, false);
  assert.equal(getAtPath(updated, "personalInfo.newField"), undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(content.experience[0].bullets[0], "Helped team");
});
