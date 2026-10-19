import type { IResumeContent } from "../../models/Resume.js";

type Content = Partial<IResumeContent> & Record<string, unknown>;

const line = (...parts: Array<string | undefined | null | false>) => parts.filter(Boolean).join(" | ");

/**
 * Compact plain-text rendering of a CV for prompts. It omits the photo, ids and
 * empty fields; sending raw JSON (with a base64 photo) cost thousands of tokens.
 */
export function cvToText(content: Content | undefined, maxChars = 12_000): string {
  if (!content) return "";
  const out: string[] = [];
  const p = content.personalInfo;
  if (p) {
    out.push(line(p.fullName, p.jobTitle, p.location));
    if (p.summary) out.push(`SUMMARY: ${p.summary}`);
  }
  if (content.careerObjective) out.push(`CAREER OBJECTIVE: ${content.careerObjective}`);

  if (content.experience?.length) {
    out.push("EXPERIENCE:");
    content.experience.forEach((e, i) => {
      out.push(`[${i}] ${line(e.position, e.company, e.location, [e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join("–"))}`);
      e.bullets?.filter(Boolean).forEach((b, j) => out.push(`  [${i}.${j}] ${b}`));
    });
  }
  if (content.education?.length) {
    out.push("EDUCATION:");
    content.education.forEach((e) =>
      out.push(`- ${line(e.degree, e.field, e.institution, e.board, e.passingYear || e.endDate, e.gpa && `${e.gpa}${e.gpaScale ? `/${e.gpaScale}` : ""}`)}`)
    );
  }
  if (content.trainings?.length) {
    out.push("TRAINING:");
    content.trainings.forEach((t) => out.push(`- ${line(t.title, t.institute, t.duration, t.year)}`));
  }
  if (content.projects?.length) {
    out.push("PROJECTS:");
    content.projects.forEach((pr) => out.push(`- ${line(pr.name, pr.technologies?.join(", "))}: ${pr.description ?? ""}`));
  }
  if (content.skills?.length) out.push(`SKILLS: ${content.skills.join(", ")}`);
  if (content.certifications?.length) out.push(`CERTIFICATIONS: ${content.certifications.map((c) => line(c.name, c.issuer, c.date)).join("; ")}`);
  if (content.languages?.length) out.push(`LANGUAGES: ${content.languages.map((l) => `${l.name} (${l.proficiency})`).join(", ")}`);
  if (content.awards?.length) out.push(`AWARDS: ${content.awards.map((a) => line(a.title, a.issuer, a.date)).join("; ")}`);
  if (content.volunteerExperience?.length) {
    out.push(`VOLUNTEER: ${content.volunteerExperience.map((v) => line(v.role, v.organization)).join("; ")}`);
  }

  const text = out.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
}

/** Wraps user-supplied text so the model treats it as data, never as instructions. */
export const asData = (tag: string, text: string) => `<${tag}>\n${text.replace(new RegExp(`</?${tag}>`, "gi"), "")}\n</${tag}>`;
