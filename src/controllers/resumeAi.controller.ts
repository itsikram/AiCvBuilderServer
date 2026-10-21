import { Response } from "express";
import { z } from "zod";
import { IResumeContent, Resume } from "../models/Resume.js";
import { IUser, User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { normalizeLanguage } from "../utils/language.js";
import { generateUniqueSlug } from "../utils/slug.js";
import { geminiService } from "../services/ai/gemini.service.js";
import { cvToText } from "../services/ai/cvText.js";
import { applyTextUpdates, collectTextFields, fieldsToPrompt, type TextField } from "../services/ai/cvFields.js";
import { checkAiLimit, checkResumeLimit, getAiQuota, incrementAiUsage } from "../services/subscription.service.js";
import { trackEvent } from "../services/analytics.service.js";
import type {
  aiContentSchema,
  grammarSchema,
  rewriteBulletsSchema,
  suggestSkillsSchema,
  tailorResumeSchema,
  translateResumeSchema,
  writeSummarySchema,
} from "../validators/resume.validator.js";

type Body<S extends z.ZodTypeAny> = z.infer<S>;

const loadUser = async (req: AuthRequest) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

/** Runs one quota-counted AI request: checks the limits first and counts only successes. */
const withAiQuota = async <T>(req: AuthRequest, run: (user: IUser) => Promise<T>): Promise<T> => {
  const user = await loadUser(req);
  await checkAiLimit(user);
  const result = await run(user);
  await incrementAiUsage(user);
  await trackEvent("aiRequests");
  return result;
};

/**
 * The CV to work on: the editor's unsaved content when sent (so suggestions match
 * what the user sees), otherwise the saved CV. Always scoped to the caller.
 */
const contentFor = async (req: AuthRequest, body: Body<typeof aiContentSchema>): Promise<Partial<IResumeContent>> => {
  if (body.content) return body.content as Partial<IResumeContent>;
  if (!body.resumeId) throw new ApiError(400, "Send the CV content or a resumeId.");
  const resume = await Resume.findOne({ _id: body.resumeId, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");
  return resume.toObject().content;
};

const byId = (fields: TextField[]) => new Map(fields.map((f) => [f.id, f]));

export const getQuota = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getAiQuota(await loadUser(req)) });
});

export const writeSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof writeSummarySchema>;
  const content = await contentFor(req, body);
  const cvText = cvToText(content, 6000);
  const current = body.kind === "summary" ? content.personalInfo?.summary : content.careerObjective;
  if (!cvText.trim() && !body.jobTitle) {
    throw new ApiError(400, "Add your target job title or some CV details first, so the AI has something to work with.");
  }
  const data = await withAiQuota(req, () =>
    geminiService.writeSummary({
      kind: body.kind,
      cvText,
      current: current ?? "",
      jobTitle: body.jobTitle || content.personalInfo?.jobTitle || "",
      tone: body.tone,
      language: body.language,
    })
  );
  res.json({ success: true, data: { ...data, options: data.options.filter((o) => o.trim()) } });
});

export const rewriteBullets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof rewriteBulletsSchema>;
  const bullets = body.bullets.map((b) => b.trim()).filter(Boolean);
  if (!bullets.length && !body.position) {
    throw new ApiError(400, "Write the job title and a few words about what you did, then ask the AI to polish it.");
  }
  const data = await withAiQuota(req, () => geminiService.rewriteBullets({ ...body, bullets }));
  res.json({ success: true, data: { ...data, bullets: data.bullets.filter((b) => b.trim()) } });
});

export const suggestSkills = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof suggestSkillsSchema>;
  const data = await withAiQuota(req, () => geminiService.suggestSkills(body.jobTitle, body.currentSkills, body.language));
  const have = new Set(body.currentSkills.map((s) => s.trim().toLowerCase()));
  const skills = [...new Set(data.skills.map((s) => s.trim()).filter((s) => s && !have.has(s.toLowerCase())))];
  res.json({ success: true, data: { skills, reasoning: data.reasoning } });
});

export interface TailorEdit {
  key: string;
  type: "rewrite" | "add_skill";
  path: string;
  before: string;
  after: string;
  reason: string;
}

export const tailorResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof tailorResumeSchema>;
  const content = await contentFor(req, body);
  const cvText = cvToText(content, 8000);
  if (!cvText.trim()) throw new ApiError(400, "Add some CV content before tailoring it to a job.");

  // Prose plus job titles: the parts worth rewriting for a specific job
  const fields = collectTextFields(content, "all").filter(
    (f) => !f.name && !/^(skills|interests|languages|personalDetails)\b|\.(location|duration|board)$/.test(f.path)
  );
  const result = await withAiQuota(req, () => geminiService.tailorResume(cvText, fieldsToPrompt(fields), body.jobDescription, body.language));

  const lookup = byId(fields);
  const existingSkills = new Set((content.skills ?? []).map((s) => s.trim().toLowerCase()));
  const edits: TailorEdit[] = [];
  result.edits.forEach((edit, i) => {
    const after = edit.after.trim();
    if (!after) return;
    if (edit.id === "skill") {
      if (existingSkills.has(after.toLowerCase())) return;
      existingSkills.add(after.toLowerCase());
      edits.push({ key: `e${i}`, type: "add_skill", path: "skills", before: "", after, reason: edit.reason });
      return;
    }
    const field = lookup.get(edit.id);
    if (field && field.text.trim() !== after) {
      edits.push({ key: `e${i}`, type: "rewrite", path: field.path, before: field.text, after, reason: edit.reason });
    }
  });

  res.json({
    success: true,
    data: {
      matchScore: Math.round(result.matchScore),
      verdict: result.verdict,
      matchedKeywords: result.matchedKeywords,
      missingKeywords: result.missingKeywords,
      edits,
    },
  });
});

export const grammarCheck = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof grammarSchema>;
  const content = await contentFor(req, body);
  const fields = collectTextFields(content, "prose");
  if (!fields.length) throw new ApiError(400, "Write your summary, objective or job duties first, then check them.");

  const result = await withAiQuota(req, () => geminiService.grammarCheck(fieldsToPrompt(fields), body.language));
  const lookup = byId(fields);
  const issues = result.issues.flatMap((issue) => {
    const field = lookup.get(issue.id);
    const corrected = issue.corrected.trim();
    if (!field || !corrected || corrected === field.text.trim()) return [];
    return [{ path: field.path, original: field.text, corrected, explanation: issue.explanation }];
  });
  res.json({ success: true, data: { issues } });
});

/** Splits fields into prompt-sized batches so long CVs never hit the output limit. */
const batches = (fields: TextField[], maxChars = 3500) => {
  const out: TextField[][] = [];
  let current: TextField[] = [];
  let size = 0;
  for (const field of fields) {
    if (current.length && (size + field.text.length > maxChars || current.length >= 60)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(field);
    size += field.text.length;
  }
  if (current.length) out.push(current);
  return out;
};

const TRANSLATED_SUFFIX = { bn: "বাংলা", en: "English" } as const;

/** Creates a translated copy of a CV; the original is left untouched. */
export const translateResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { targetLanguage } = req.body as Body<typeof translateResumeSchema>;
  const original = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!original) throw new ApiError(404, "Resume not found");

  const user = await loadUser(req);
  await checkResumeLimit(user, await Resume.countDocuments({ userId: user._id }));

  const source = original.toObject();
  const fields = collectTextFields(source.content, "all");
  if (!fields.length) throw new ApiError(400, "This CV has no text to translate yet.");

  const translated = await withAiQuota(req, async () => {
    const updates: Array<{ path: string; text: string }> = [];
    for (const batch of batches(fields)) {
      const lookup = byId(batch);
      const result = await geminiService.translateFields(fieldsToPrompt(batch), targetLanguage);
      for (const item of result.fields) {
        const field = lookup.get(item.id);
        if (field && item.text.trim()) updates.push({ path: field.path, text: item.text.trim() });
      }
    }
    return applyTextUpdates(source.content, updates);
  });

  const title = `${original.title} (${TRANSLATED_SUFFIX[targetLanguage]})`.slice(0, 200);
  const copy = await Resume.create({
    userId: user._id,
    title,
    slug: generateUniqueSlug(title),
    templateId: original.templateId,
    format: original.format,
    content: translated,
    language: normalizeLanguage(targetLanguage),
    theme: source.theme,
    sectionOrder: original.sectionOrder,
  });
  user.usage.resumesCreated += 1;
  await user.save();
  await trackEvent("resumesCreated");

  res.status(201).json({ success: true, data: copy });
});
