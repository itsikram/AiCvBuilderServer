import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCvEdits, applyTextUpdates, coachFields, editableFields, fieldLimit, fieldsToPrompt, toCvEdits } from "./cvFields.js";
import { resumeContentSchema } from "../../validators/resume.validator.js";
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

test("edits that apply-edits would refuse are never proposed", () => {
  const fields = editableFields(content);
  const position = fields.find((f) => f.path === "experience.0.position")!;
  const edits = toCvEdits(
    [
      { id: position.id, after: "x".repeat(201), reason: "too long for a job title" },
      { id: "skill", after: "s".repeat(101), reason: "too long for a skill" },
    ],
    fields,
    content.skills
  );
  assert.deepEqual(edits, []);
  const full = toCvEdits([{ id: "skill", after: "Tally", reason: "" }], fields, Array.from({ length: 100 }, (_, i) => `Skill ${i}`));
  assert.deepEqual(full, []);
});

test("the coach can fill a blank summary or objective, and only when it is still blank", () => {
  const blank = { ...content, personalInfo: { ...content.personalInfo, summary: "" }, careerObjective: "" };
  const fields = coachFields(blank);
  const slots = fields.filter((f) => f.empty).map((f) => f.path);
  assert.deepEqual(slots, ["personalInfo.summary", "careerObjective"]);
  assert.match(fieldsToPrompt(fields), /\ne0 \(empty\): $/m);

  const [summary] = toCvEdits([{ id: "e0", after: "Accounting graduate.", reason: "asked for" }], fields);
  assert.deepEqual([summary.path, summary.before], ["personalInfo.summary", ""]);
  const result = applyCvEdits(blank, [summary]);
  assert.deepEqual(result.results, ["applied"]);
  assert.equal(result.content.personalInfo.summary, "Accounting graduate.");
  // Filled since: the suggestion no longer applies
  assert.deepEqual(applyCvEdits(result.content, [{ ...summary, after: "Other" }]).results, ["skipped"]);
  // Not offered for fields that already have text
  assert.equal(coachFields(content).some((f) => f.empty), false);
});

test("every editable field's limit matches the CV validator, so an applied edit always saves", () => {
  const item = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, "x"]));
  const cv = {
    personalInfo: { jobTitle: "x", summary: "x" },
    careerObjective: "x",
    experience: [{ position: "x", bullets: ["x"] }],
    education: [item(["degree", "field"])],
    trainings: [item(["title", "description"])],
    projects: [item(["description"])],
    certifications: [item(["name"])],
    awards: [item(["title", "description"])],
    publications: [item(["title", "description"])],
    volunteerExperience: [item(["role", "description"])],
    references: [item(["position", "relationship"])],
    courses: [item(["name"])],
    memberships: [item(["role"])],
    customSections: [item(["title", "content"])],
  };
  const paths = editableFields(cv).map((f) => f.path);
  assert.equal(paths.length, 23);
  for (const path of paths) {
    const limit = fieldLimit(path);
    // The validator takes exactly `limit` characters for this field...
    const at = (text: string) => applyTextUpdates(cv, [{ path, text }]);
    assert.equal(resumeContentSchema.safeParse(at("a".repeat(limit))).success, true, `validator should accept ${limit} chars in ${path}`);
    assert.equal(resumeContentSchema.safeParse(at("a".repeat(limit + 1))).success, false, `validator should reject ${limit + 1} chars in ${path}`);
    // ...and apply-edits takes the same
    const apply = (text: string) => applyCvEdits(cv, [{ type: "rewrite", path, before: "x", after: text }]).results[0];
    assert.equal(apply("a".repeat(limit)), "applied", path);
    assert.equal(apply("a".repeat(limit + 1)), "skipped", path);
  }
});
