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
  matchScore: S.number("0-100: how well the CV as written fits the job", 0, 100),
  verdict: S.string("1-2 sentences on the fit and the biggest gap", 400),
  matchedKeywords: S.array(S.string(undefined, 60), 25),
  missingKeywords: S.array(S.string("Important job keyword or requirement not shown in the CV", 60), 25),
  edits: S.array(
    S.object({
      id: S.string("A field id from <fields> (f0, f1, ...) to rewrite, or \"skill\" to add a skill", 10),
      after: S.string("The new text for that field, or the skill name to add", 1200),
      reason: S.string("Why this helps for this job, in a few words", 200),
    }),
    10
  ),
});

const writeOptionsSchema = S.object({
  options: S.array(S.string(undefined, 1200), 3),
  tip: S.string("One short tip on what the candidate could add to make it stronger", 300),
});

const bulletsSchema = S.object({
  bullets: S.array(S.string(undefined, 300), 6),
  tips: S.array(S.string("A question or tip, e.g. which number to add", 200), 3),
});

const grammarSchema = S.object({
  issues: S.array(
    S.object({
      id: S.string("Field id from <fields>", 10),
      corrected: S.string("The full corrected text of that field", 3000),
      explanation: S.string("What was wrong, in a few words", 200),
    }),
    30
  ),
});

const translateSchema = S.object({
  fields: S.array(S.object({ id: S.string(undefined, 10), text: S.string(undefined, 3000) }), 120),
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

  /**
   * Scores the CV against a job post and proposes edits the user approves one by
   * one. `fields` are the CV's prose fields (summary, objective, bullets...) with ids.
   */
  tailorResume(cvText: string, fields: string, jobDescription: string, language: Lang) {
    return generateJson({
      task: "tailor-resume",
      system: baseSystem(language),
      schema: tailorSchema,
      temperature: 0.3,
      maxOutputTokens: 3000,
      prompt: [
        "Compare the CV with the job post (it may be in English or Bangla, e.g. a bdjobs.com circular).",
        "1. matchScore: how well the CV as written matches the requirements (skills, experience, education, keywords).",
        "2. matchedKeywords / missingKeywords: the job's important keywords and requirements, split by whether the CV shows them.",
        "3. edits: up to 8 concrete edits, most valuable first. Rewrite a field from <fields> by its id so it highlights",
        "relevant facts the candidate already has and uses the job's wording. Use id \"skill\" to add a skill only if the CV",
        "shows evidence of it. Never claim experience, tools or qualifications the CV doesn't show.",
        asData("cv", cvText),
        asData("fields", fields),
        asData("job", jobDescription.slice(0, 8000)),
      ].join("\n"),
    });
  }

  /** Three alternative summaries or career objectives in the requested tone. */
  writeSummary(input: { kind: "summary" | "objective"; cvText: string; current: string; jobTitle: string; tone: Tone; language: Lang }) {
    const what =
      input.kind === "summary"
        ? "a professional summary (2-4 sentences: who the candidate is, key strengths, what they offer)"
        : "a career objective (2-3 sentences: the role they want and what they will contribute), as used on Bangladeshi CVs";
    return generateJson({
      task: `write-${input.kind}`,
      system: baseSystem(input.language),
      schema: writeOptionsSchema,
      temperature: 0.7,
      maxOutputTokens: 1200,
      prompt: [
        `Write 3 different versions of ${what}${input.jobTitle ? ` for a "${input.jobTitle}" role` : ""}.`,
        `Tone: ${TONES[input.tone]}. Base it only on the CV facts.`,
        input.current ? "Improve on the candidate's current draft (in <text>), keeping its facts." : "",
        asData("cv", input.cvText),
        input.current ? asData("text", input.current) : "",
      ].join("\n"),
    });
  }

  /** Rewrites one job's bullets with action verbs; numbers only if the user gave them. */
  rewriteBullets(input: { position: string; company: string; bullets: string[]; jobTitle: string; tone: Tone; language: Lang }) {
    return generateJson({
      task: "rewrite-bullets",
      system: baseSystem(input.language),
      schema: bulletsSchema,
      temperature: 0.5,
      maxOutputTokens: 1200,
      prompt: [
        `Rewrite the duties of this job as 3-5 CV bullet points${input.jobTitle ? ` that suit a "${input.jobTitle}" application` : ""}.`,
        "Start each with a strong past-tense action verb (present tense if the job is current). One line each, under 25 words.",
        "Show results and scope. Keep every number the user gave; never add new numbers. If a number would make a bullet",
        "much stronger, ask for it in tips instead (e.g. \"How many customers did you handle per day?\").",
        `Tone: ${TONES[input.tone]}.`,
        asData("notes", [`Position: ${input.position || "-"}`, `Company: ${input.company || "-"}`, ...input.bullets.map((b) => `- ${b}`)].join("\n")),
      ].join("\n"),
    });
  }

  grammarCheck(fields: string, language: Lang) {
    return generateJson({
      task: "grammar-check",
      system: baseSystem(language).replace(languageNeutral, "Keep each field in its original language."),
      schema: grammarSchema,
      temperature: 0,
      maxOutputTokens: 4000,
      prompt: [
        "Check each field for spelling, grammar, punctuation and capitalisation mistakes (English or Bangla).",
        "Only report fields that need a change; return the full corrected text of that field. Keep the meaning, facts and",
        "style; don't rewrite text that is already correct. Fix inconsistent tense in bullets.",
        asData("fields", fields),
      ].join("\n"),
    });
  }

  translateFields(fields: string, target: Lang) {
    const targetName = target === "bn" ? "Bangla (বাংলা)" : "English";
    return generateJson({
      task: `translate-${target}`,
      system: baseSystem(target),
      schema: translateSchema,
      temperature: 0.2,
      maxOutputTokens: 8000,
      prompt: [
        `Translate every field into natural, professional ${targetName} for a CV. Return every id exactly once.`,
        "Fields marked (name) are people, employers or institutions: transliterate them into the target script only if",
        "that is how they are normally written there (Bangladeshi people's names usually are); otherwise keep them unchanged.",
        "Keep degree names (SSC, HSC, BSc, MBA), GPA/CGPA values, software and brand names in their usual form.",
        "If a field is already in the target language, return it unchanged.",
        asData("fields", fields),
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
