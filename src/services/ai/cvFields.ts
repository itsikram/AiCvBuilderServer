import type { IResumeContent } from "../../models/Resume.js";

/**
 * A single editable text value inside a CV, addressed by a dot path such as
 * "experience.0.bullets.2". AI tasks that edit text (grammar check, translation,
 * tailoring) send the model short ids ("f12") instead of the whole CV as JSON, and
 * the answers are mapped back to paths, so the model can't touch anything else.
 */
export interface TextField {
  id: string;
  path: string;
  text: string;
  /** Proper nouns (people, employers, institutions): translated by transliteration only */
  name?: boolean;
}

type Content = Partial<IResumeContent>;

/** "prose" = sentences worth grammar-checking or tailoring; "all" adds titles, names and short values. */
export type FieldScope = "prose" | "all";

interface Spec {
  key: string;
  scope: FieldScope;
  name?: boolean;
}

const prose = (key: string): Spec => ({ key, scope: "prose" });
const short = (key: string, name = false): Spec => ({ key, scope: "all", name });

/** Text fields of each list section; anything not listed (ids, dates, urls, emails) is never sent. */
const LIST_FIELDS: Record<string, Spec[]> = {
  experience: [short("position"), short("company", true), short("location")],
  education: [short("degree"), short("field"), short("institution", true), short("board", true)],
  trainings: [short("title"), short("institute", true), short("duration"), prose("description")],
  projects: [short("name", true), prose("description")],
  languages: [short("name")],
  certifications: [short("name"), short("issuer", true)],
  awards: [short("title"), short("issuer", true), prose("description")],
  publications: [short("title"), short("publisher", true), prose("description")],
  volunteerExperience: [short("role"), short("organization", true), prose("description")],
  references: [short("name", true), short("position"), short("company", true), short("relationship")],
  courses: [short("name"), short("provider", true)],
  memberships: [short("organization", true), short("role")],
  customSections: [short("title"), prose("content")],
};

const PERSONAL_INFO: Spec[] = [short("fullName", true), short("jobTitle"), short("location"), prose("summary")];
const PERSONAL_DETAILS: Spec[] = [
  short("fatherName", true),
  short("motherName", true),
  short("gender"),
  short("nationality"),
  short("religion"),
  short("maritalStatus"),
  short("permanentAddress"),
];

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function collectTextFields(content: Content | undefined, scope: FieldScope = "all"): TextField[] {
  const out: TextField[] = [];
  if (!content) return out;
  const wanted = (spec: Spec) => scope === "all" || spec.scope === "prose";
  const push = (path: string, text: unknown, name?: boolean) => {
    if (isText(text)) out.push({ id: `f${out.length}`, path, text, ...(name ? { name } : {}) });
  };

  const info = content.personalInfo as Record<string, unknown> | undefined;
  if (info) PERSONAL_INFO.filter(wanted).forEach((s) => push(`personalInfo.${s.key}`, info[s.key], s.name));
  push("careerObjective", content.careerObjective);

  const details = content.personalDetails as Record<string, unknown> | undefined;
  if (details && scope === "all") PERSONAL_DETAILS.forEach((s) => push(`personalDetails.${s.key}`, details[s.key], s.name));

  (content.experience ?? []).forEach((item, i) => {
    LIST_FIELDS.experience.filter(wanted).forEach((s) => push(`experience.${i}.${s.key}`, (item as never)[s.key], s.name));
    (item.bullets ?? []).forEach((bullet, j) => push(`experience.${i}.bullets.${j}`, bullet));
  });

  for (const [section, specs] of Object.entries(LIST_FIELDS)) {
    if (section === "experience") continue;
    const items = (content as Record<string, unknown>)[section];
    if (!Array.isArray(items)) continue;
    items.forEach((item, i) => specs.filter(wanted).forEach((s) => push(`${section}.${i}.${s.key}`, item?.[s.key], s.name)));
  }

  if (scope === "all") {
    (content.skills ?? []).forEach((skill, i) => push(`skills.${i}`, skill));
    (content.interests ?? []).forEach((interest, i) => push(`interests.${i}`, interest));
  }
  return out;
}

/** "f0: text" lines for prompts; newlines inside values are flattened. */
export const fieldsToPrompt = (fields: TextField[]) =>
  fields.map((f) => `${f.id}${f.name ? " (name)" : ""}: ${f.text.replace(/\s*\n\s*/g, " / ")}`).join("\n");

const SAFE_SEGMENT = /^(?:[a-zA-Z]+|\d{1,3})$/;

/** Reads a value at a dot path; undefined if any segment is missing. */
export function getAtPath(target: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node == null ? undefined : (node as Record<string, unknown>)[key]), target);
}

/**
 * Returns a copy of `content` with each path set to its new text. Only paths that
 * already hold a string are changed, so a bad path from the model is ignored
 * rather than creating fields (or touching __proto__).
 */
export function applyTextUpdates<T extends object>(content: T, updates: Array<{ path: string; text: string }>): T {
  // Deep copy, so the caller's content is never changed
  const copy = JSON.parse(JSON.stringify(content)) as T;
  for (const { path, text } of updates) {
    const keys = path.split(".");
    if (!keys.every((k) => SAFE_SEGMENT.test(k))) continue;
    const parent = keys.slice(0, -1).reduce<unknown>((node, key) => (node == null ? undefined : (node as Record<string, unknown>)[key]), copy);
    const last = keys[keys.length - 1];
    if (parent && typeof parent === "object" && typeof (parent as Record<string, unknown>)[last] === "string") {
      (parent as Record<string, unknown>)[last] = text;
    }
  }
  return copy;
}
