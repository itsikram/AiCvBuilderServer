import { generateJson } from "./gemini.client.js";
import { S } from "./schema.js";
import { baseSystem, TONES, type Tone } from "./prompts.js";
import { asData } from "./cvText.js";

type Lang = "en" | "bn";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const experienceBullets = S.array(
  S.object({
    index: S.number("Index of the experience entry in the CV, starting at 0", 0, 100),
    company: S.string(),
    position: S.string(),
    bullets: S.array(S.string(undefined, 400), 6),
  }),
  10
);

const generateResumeSchema = S.object({
  summary: S.string("2-4 sentence professional summary", 1200),
  careerObjective: S.string("2-3 sentence career objective for the target role", 800),
  experienceBullets,
  skills: S.array(S.string(undefined, 60), 15),
  suggestedKeywords: S.array(S.string(undefined, 60), 12),
  careerTips: S.array(S.string(undefined, 300), 5),
});

const tailorSchema = S.object({
  summary: S.string(undefined, 1200),
  skills: S.array(S.string(undefined, 60), 20),
  experienceBullets,
  suggestions: S.array(S.string(undefined, 300), 8),
});

const improveSchema = S.object({
  atsScore: S.number("0-100", 0, 100),
  matchedKeywords: S.array(S.string(undefined, 60), 30),
  missingKeywords: S.array(S.string(undefined, 60), 30),
  improvedBullets: S.array(S.object({ original: S.string(undefined, 600), improved: S.string(undefined, 600) }), 10),
  suggestions: S.array(S.string(undefined, 300), 8),
  optimizedSummary: S.string(undefined, 1200),
});

const coverLetterSchema = S.object({
  subject: S.string(undefined, 200),
  greeting: S.string(undefined, 120),
  body: S.string("The letter body: 3-4 short paragraphs separated by blank lines", 4000),
  closing: S.string(undefined, 200),
  fullLetter: S.string("greeting + body + closing as one plain-text letter", 5000),
});

const atsSchema = S.object({
  score: S.number("0-100", 0, 100),
  grade: S.enum(["A", "B", "C", "D", "F"] as const),
  strengths: S.array(S.string(undefined, 300), 8),
  weaknesses: S.array(S.string(undefined, 300), 8),
  keywordAnalysis: S.object({
    found: S.array(S.string(undefined, 60), 30),
    missing: S.array(S.string(undefined, 60), 30),
  }),
  recommendations: S.array(S.string(undefined, 300), 8),
});

const skillsSchema = S.object({
  skills: S.array(S.string(undefined, 60), 15),
  reasoning: S.string(undefined, 600),
});

const str = (max = 300) => S.string(undefined, max);
const parsedCvSchema = S.object({
  personalInfo: S.object({
    fullName: str(120),
    email: str(200),
    phone: str(40),
    location: str(200),
    linkedin: str(),
    portfolio: str(),
    github: str(),
    website: str(),
    summary: str(3000),
    jobTitle: str(120),
  }),
  careerObjective: str(2000),
  personalDetails: S.object({
    fatherName: str(120),
    motherName: str(120),
    dateOfBirth: str(40),
    gender: str(40),
    nationality: str(60),
    religion: str(60),
    maritalStatus: str(40),
    nid: str(40),
    bloodGroup: str(10),
    permanentAddress: str(400),
  }),
  experience: S.array(
    S.object({
      company: str(200),
      position: str(200),
      location: str(200),
      startDate: str(40),
      endDate: str(40),
      current: S.enum(["yes", "no"] as const),
      bullets: S.array(str(1000), 12),
    }),
    20
  ),
  education: S.array(
    S.object({
      level: S.enum(["ssc", "hsc", "diploma", "honours", "bachelor", "masters", "phd", "other"] as const),
      institution: str(200),
      degree: str(200),
      field: str(200),
      board: str(120),
      passingYear: str(10),
      gpa: str(40),
      gpaScale: str(10),
    }),
    12
  ),
  trainings: S.array(S.object({ title: str(200), institute: str(200), duration: str(60), year: str(20) }), 15),
  skills: S.array(str(100), 60),
  languages: S.array(S.object({ name: str(80), proficiency: S.enum(["native", "fluent", "intermediate", "basic"] as const) }), 10),
  certifications: S.array(S.object({ name: str(200), issuer: str(200), date: str(40) }), 20),
  projects: S.array(S.object({ name: str(200), description: str(2000), url: str(), technologies: S.array(str(80), 15) }), 15),
  awards: S.array(S.object({ title: str(200), issuer: str(200), date: str(40), description: str(1000) }), 15),
  references: S.array(
    S.object({ name: str(120), position: str(200), company: str(200), email: str(200), phone: str(40), relationship: str(120) }),
    5
  ),
  interests: S.array(str(100), 20),
});

export type ParsedCv = typeof parsedCvSchema extends { zod: { _output: infer T } } ? T : never;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
class GeminiService {
  generateResume(input: {
    name: string;
    jobTitle: string;
    skills: string;
    experience: string;
    education: string;
    projects: string;
    language: Lang;
  }) {
    return generateJson({
      task: "generate-resume",
      system: baseSystem(input.language),
      schema: generateResumeSchema,
      temperature: 0.5,
      prompt: [
        `Draft CV content for this candidate targeting the role "${input.jobTitle}".`,
        "Rewrite the experience as 3-5 achievement-focused bullets per entry, each starting with a strong action verb.",
        "Suggest 8-12 relevant skills (hard and soft) consistent with the data, plus keywords recruiters search for, and 3 short career tips.",
        asData("notes", [
          `Name: ${input.name}`,
          `Target role: ${input.jobTitle}`,
          `Skills: ${input.skills || "-"}`,
          `Experience: ${input.experience || "No work experience (fresher)"}`,
          `Education: ${input.education || "-"}`,
          `Projects: ${input.projects || "-"}`,
        ].join("\n")),
      ].join("\n"),
    });
  }

  tailorResume(cvText: string, jobDescription: string, language: Lang) {
    return generateJson({
      task: "tailor-resume",
      system: baseSystem(language),
      schema: tailorSchema,
      prompt: [
        "Tailor this CV to the job. Rewrite the summary for the role, reorder and filter skills to what the job needs (only skills the candidate has),",
        "and rewrite bullets of the most relevant experience entries (reference each entry by its [index]). List the top keywords or themes to emphasise.",
        asData("cv", cvText),
        asData("job", jobDescription),
      ].join("\n"),
    });
  }

  improveResume(resumeText: string, jobDescription: string, language: Lang) {
    return generateJson({
      task: "improve-resume",
      system: baseSystem(language),
      schema: improveSchema,
      prompt: [
        "Score how well this CV matches the job (0-100) based on keyword overlap, relevance and clarity.",
        "List matched and missing keywords from the job, rewrite up to 6 weak bullets (quote the original exactly), give 5 concrete suggestions, and an optimized summary.",
        asData("cv", resumeText),
        asData("job", jobDescription),
      ].join("\n"),
    });
  }

  generateCoverLetter(input: {
    name: string;
    jobTitle: string;
    companyName: string;
    resumeSummary: string;
    jobDescription: string;
    language: Lang;
    tone?: Tone;
  }) {
    return generateJson({
      task: "cover-letter",
      system: baseSystem(input.language),
      schema: coverLetterSchema,
      temperature: 0.6,
      prompt: [
        `Write a cover letter under 300 words from ${input.name} for the "${input.jobTitle}" role at ${input.companyName}.`,
        `Tone: ${TONES[input.tone ?? "formal"]}. Structure: why you're writing; 2-3 strengths that match the job with evidence from the CV; why this employer; polite closing asking for an interview.`,
        "Do not include placeholders like [Address]; omit anything unknown.",
        asData("cv", input.resumeSummary),
        asData("job", input.jobDescription),
      ].join("\n"),
    });
  }

  checkATS(resumeContent: string, jobDescription: string | undefined, language: Lang = "en") {
    return generateJson({
      task: "ats-check",
      system: baseSystem(language),
      schema: atsSchema,
      temperature: 0.2,
      prompt: [
        `Evaluate this CV for applicant tracking systems${jobDescription ? " against the job" : ""}:`,
        "keywords, standard section headings, formatting risks, bullet quality, contact completeness and length.",
        "Grade A (excellent) to F. Give specific, actionable recommendations.",
        asData("cv", resumeContent),
        jobDescription ? asData("job", jobDescription) : "",
      ].join("\n"),
    });
  }

  suggestSkills(jobTitle: string, currentSkills: string[], language: Lang = "en") {
    return generateJson({
      task: "suggest-skills",
      system: baseSystem(language),
      schema: skillsSchema,
      temperature: 0.4,
      prompt: `Suggest up to 10 in-demand skills for a "${jobTitle}" role in Bangladesh that are not already listed. Current skills: ${currentSkills.join(", ") || "none"}. Mix technical and soft skills.`,
    });
  }

  parseResume(resumeText: string) {
    return generateJson({
      task: "parse-resume",
      system: baseSystem("en").replace(languageNeutral, "Keep every value in the language it appears in the source text."),
      schema: parsedCvSchema,
      temperature: 0,
      maxOutputTokens: 6000,
      prompt: [
        "Extract the CV below into the schema. Copy facts exactly; do not invent or embellish.",
        "Use empty strings or empty arrays for anything missing. Dates: YYYY-MM when possible, otherwise as written.",
        "Map Bangladeshi qualifications to education.level (SSC, HSC, Diploma, Honours/BSc/BBA = honours or bachelor, Masters/MBA = masters).",
        "Put father's/mother's name, date of birth, NID, religion etc. into personalDetails.",
        asData("text", resumeText.slice(0, 30_000)),
      ].join("\n"),
    });
  }
}

const languageNeutral = /Write all output text in clear, professional English[^\n]*/;

export const geminiService = new GeminiService();
