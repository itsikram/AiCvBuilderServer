import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCvEdits, editableFields, fieldLimit, toCvEdits } from "./cvFields.js";
import { chatTranscript } from "./chat.js";

const content = {
  personalInfo: { fullName: "Rahim Uddin", email: "rahim@example.com", jobTitle: "Accountant", summary: "Hard working graduate." },
  careerObjective: "To work in a reputed company.",
  personalDetails: { fatherName: "Karim Uddin" },
  experience: [{ id: "a", company: "BRAC", position: "Intern", location: "Dhaka", bullets: ["Helped team"] }],
  skills: ["Excel"],
};

test("editable fields skip names, personal details, skills and locations", () => {
  const paths = editableFields(content).map((f) => f.path);
  assert.deepEqual(paths, ["personalInfo.jobTitle", "personalInfo.summary", "careerObjective", "experience.0.position", "experience.0.bullets.0"]);
});

test("model edits map to paths; unknown ids, unchanged text and known skills are dropped", () => {
  const fields = editableFields(content);
  const summary = fields.find((f) => f.path === "personalInfo.summary")!;
  const edits = toCvEdits(
    [
      { id: summary.id, after: "Detail-oriented accounting graduate.", reason: "clearer" },
      { id: "f99", after: "x", reason: "" },
      { id: summary.id, after: " Hard working graduate. ", reason: "same" },
      { id: "skill", after: "excel", reason: "dup" },
      { id: "skill", after: "Tally", reason: "job keyword" },
      { id: "skill", after: "Tally", reason: "dup" },
    ],
    fields,
    content.skills
  );
  assert.deepEqual(
    edits.map((e) => [e.type, e.path, e.before, e.after]),
    [
      ["rewrite", "personalInfo.summary", "Hard working graduate.", "Detail-oriented accounting graduate."],
      ["add_skill", "skills", "", "Tally"],
    ]
  );
});

test("approved edits are applied only where the field still holds the original text", () => {
  const result = applyCvEdits(content, [
    { type: "rewrite", path: "personalInfo.summary", before: "Hard working graduate.", after: "Accounting graduate." },
    { type: "rewrite", path: "careerObjective", before: "an older text", after: "New objective" },
    { type: "add_skill", path: "skills", before: "", after: "Tally" },
    { type: "add_skill", path: "skills", before: "", after: "EXCEL" },
  ]);
  assert.deepEqual(result.results, ["applied", "skipped", "applied", "applied"]);
  assert.equal(result.applied, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.content.personalInfo.summary, "Accounting graduate.");
  assert.equal(result.content.careerObjective, "To work in a reputed company.");
  assert.deepEqual(result.content.skills, ["Excel", "Tally"]);
  // The original is untouched
  assert.equal(content.personalInfo.summary, "Hard working graduate.");
});

test("edits to protected or unknown fields, or over the field's length limit, are skipped", () => {
  const result = applyCvEdits(content, [
    { type: "rewrite", path: "personalInfo.email", before: "rahim@example.com", after: "evil@example.com" },
    { type: "rewrite", path: "personalInfo.fullName", before: "Rahim Uddin", after: "Someone Else" },
    { type: "rewrite", path: "__proto__.polluted", before: "", after: "x" },
    { type: "rewrite", path: "experience.0.position", before: "Intern", after: "x".repeat(201) },
  ]);
  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 4);
  assert.equal(result.content.personalInfo.email, "rahim@example.com");
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(fieldLimit("experience.3.bullets.1"), 1000);
  assert.equal(fieldLimit("personalInfo.summary"), 3000);
});

test("chat transcript keeps the newest turns within the size limit", () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `message ${i}` }) as const);
  const transcript = chatTranscript([...messages, { role: "user", content: "last question" }], 4);
  assert.equal(transcript.split("\n\n").length, 4);
  assert.match(transcript, /USER: last question$/);
  assert.match(transcript, /^COACH: message 17/);

  const long = chatTranscript([{ role: "user", content: "a".repeat(500) }, { role: "user", content: "b".repeat(80) }], 12, 100);
  assert.equal(long, `USER: ${"b".repeat(80)}`);
});
