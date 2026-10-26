import { Response } from "express";
import fs from "fs";
import { createHash } from "crypto";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database.js";
import {
  DEFAULT_SECTION_ORDER,
  DEFAULT_THEME,
  IResumeContent,
  asJson,
  serializeResume,
  withContentDefaults,
} from "../models/Resume.js";
import type { User } from "../models/User.js";
import type { Prisma } from "../generated/prisma/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { generateUniqueSlug } from "../utils/slug.js";
import { normalizeLanguage } from "../utils/language.js";
import { config } from "../config/index.js";
import { geminiService, type ParsedCv } from "../services/ai/gemini.service.js";
import {
  checkResumeLimit,
  checkAiLimit,
  incrementAiUsage,
  checkFeatureAccess,
  getUserLimits,
} from "../services/subscription.service.js";
import { generateResumePDF } from "../services/pdf.service.js";
import { trackEvent } from "../services/analytics.service.js";
import { cacheGet, cacheSet } from "../config/redis.js";
import { extractCvText } from "../services/pdf-extraction.service.js";
import { uploadBuffer } from "../services/cloudinary.service.js";
import { updateResumeSchema, type ResumeContentInput } from "../validators/resume.validator.js";

type UpdateResumeInput = z.infer<typeof updateResumeSchema>;

const hasText = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasText);
  if (typeof value === "object" && value !== null) return Object.values(value).some(hasText);
  return String(value ?? "").trim().length > 0;
};

/** Gives AI-parsed entries ids and drops empty placeholder items. */
const withIds = <T extends object>(items: T[]) => items.filter(hasText).map((item) => ({ ...item, id: uuidv4() }));

const normalizeParsedResumeContent = (parsed: ParsedCv): IResumeContent => {
  const details = parsed.personalDetails;
  return {
    personalInfo: {
      ...parsed.personalInfo,
      profilePhoto: "",
      profilePhotoSize: "medium",
      profilePhotoAlignment: "center",
    },
    careerObjective: parsed.careerObjective,
    personalDetails: hasText(details) ? details : undefined,
    experience: withIds(parsed.experience).map((exp) => ({
      ...exp,
      current: exp.current === "yes",
      bullets: exp.bullets.filter(Boolean),
    })),
    education: withIds(parsed.education).map((edu) => ({ ...edu, startDate: "", endDate: edu.passingYear })),
    trainings: withIds(parsed.trainings),
    projects: withIds(parsed.projects),
    skills: parsed.skills.filter(Boolean),
    languages: withIds(parsed.languages),
    certifications: withIds(parsed.certifications).map((c) => ({ ...c, credentialId: "", credentialUrl: "" })),
    awards: withIds(parsed.awards),
    publications: [],
    volunteerExperience: [],
    references: withIds(parsed.references),
    interests: parsed.interests.filter(Boolean),
    courses: [],
    memberships: [],
    customSections: [],
  };
};

const loadUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

/** A CV owned by the caller, or 404 */
const findOwnResume = async (id: string, userId: string) => {
  const resume = await prisma.resume.findFirst({ where: { id, userId } });
  if (!resume) throw new ApiError(404, "Resume not found");
  return resume;
};

const countResumes = (userId: string) => prisma.resume.count({ where: { userId } });

const resolveTemplateForUser = async (templateId: string, user: User) => {
  const template = await prisma.template.findFirst({ where: { slug: templateId, isActive: true } });
  if (!template) throw new ApiError(404, "Template not found");

  const limits = await getUserLimits(user);
  if (template.isPremium && !limits.premiumTemplates) {
    throw new ApiError(403, "Upgrade to Premium to use this template");
  }

  return template;
};

/** Counts a newly created CV against the user's lifetime total */
const countCreatedResume = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { resumesCreated: { increment: 1 } } });

export const getResumes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resumes = await prisma.resume.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ success: true, data: resumes.map(serializeResume) });
});

export const getResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await findOwnResume(String(req.params.id), req.user!.userId);
  res.json({ success: true, data: serializeResume(resume) });
});

export const createResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadUser(req.user!.userId);
  await checkResumeLimit(user, await countResumes(user.id));

  const { title, templateId, format, language } = req.body;
  const template = await resolveTemplateForUser(templateId || "modern-ats", user);
  const resolvedLanguage = normalizeLanguage(language || user.language);
  const content = withContentDefaults({
    personalInfo: {
      fullName: user.name,
      email: user.email,
      phone: "",
      location: "Dhaka, Bangladesh",
      summary: "",
    },
    careerObjective: "",
    personalDetails: { nationality: resolvedLanguage === "bn" ? "বাংলাদেশী" : "Bangladeshi" },
    languages:
      resolvedLanguage === "bn"
        ? [
            { id: uuidv4(), name: "বাংলা", proficiency: "native" },
            { id: uuidv4(), name: "ইংরেজি", proficiency: "fluent" },
          ]
        : [
            { id: uuidv4(), name: "Bangla", proficiency: "native" },
            { id: uuidv4(), name: "English", proficiency: "fluent" },
          ],
  });
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title,
      slug: generateUniqueSlug(title),
      templateId: template.slug,
      format: format || "ats",
      language: resolvedLanguage,
      theme: asJson(template.defaultTheme ?? {}),
      sectionOrder: asJson(DEFAULT_SECTION_ORDER),
      content: asJson(content),
    },
  });

  await countCreatedResume(user.id);
  await trackEvent("resumesCreated");

  res.status(201).json({ success: true, data: serializeResume(resume) });
});

export const updateResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Only whitelisted, validated fields reach the database (validate() replaced req.body)
  const { content, theme, sectionOrder, ...fields } = req.body as UpdateResumeInput;
  await findOwnResume(String(req.params.id), req.user!.userId);
  if (fields.templateId) {
    const user = await loadUser(req.user!.userId);
    fields.templateId = (await resolveTemplateForUser(fields.templateId, user)).slug;
  }
  const resume = await prisma.resume.update({
    where: { id: String(req.params.id) },
    data: {
      ...fields,
      ...(content !== undefined && { content: asJson(withContentDefaults(content as Partial<IResumeContent>)) }),
      ...(theme !== undefined && { theme: asJson(theme) }),
      ...(sectionOrder !== undefined && { sectionOrder: asJson(sectionOrder) }),
    },
  });
  res.json({ success: true, data: serializeResume(resume) });
});

export const updateTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { templateId } = req.body;
  if (!templateId) {
    throw new ApiError(400, "templateId is required");
  }
  const user = await loadUser(req.user!.userId);
  const template = await resolveTemplateForUser(templateId, user);
  await findOwnResume(String(req.params.id), user.id);
  const resume = await prisma.resume.update({
    where: { id: String(req.params.id) },
    data: { templateId: template.slug, theme: asJson(template.defaultTheme ?? {}) },
  });
  res.json({ success: true, data: serializeResume(resume) });
});

export const deleteResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { count } = await prisma.resume.deleteMany({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!count) throw new ApiError(404, "Resume not found");
  res.json({ success: true, message: "Resume deleted" });
});

export const generateWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadUser(req.user!.userId);
  await checkAiLimit(user);

  const language = normalizeLanguage(req.body.language || user.language);
  const result = await geminiService.generateResume({ ...req.body, language });
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  // The client applies suggestions it receives; nothing is written to the CV here.
  res.json({ success: true, data: result });
});

export const improveWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadUser(req.user!.userId);
  await checkFeatureAccess(user, "aiOptimization");
  await checkAiLimit(user);

  const language = normalizeLanguage(req.body.language || user.language);
  const result = await geminiService.improveResume(
    req.body.resumeText,
    req.body.jobDescription,
    language
  );
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  if (req.body.resumeId) {
    // Scoped to the caller: users can only annotate their own CVs
    await prisma.resume.updateMany({
      where: { id: req.body.resumeId, userId: user.id },
      data: { atsScore: Math.round(result.atsScore), atsFeedback: asJson(result.suggestions) },
    });
  }

  res.json({ success: true, data: result });
});

export const checkATS = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadUser(req.user!.userId);
  await checkFeatureAccess(user, "atsChecker");
  await checkAiLimit(user);

  const language = normalizeLanguage(req.body.language || user.language);
  // Hash of the full input, so different CVs never share a cached report
  const cacheKey = `ats:${createHash("sha256").update(JSON.stringify([req.body.resumeText, req.body.jobDescription ?? "", language])).digest("hex")}`;
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached, cached: true });
    return;
  }

  const result = await geminiService.checkATS(
    req.body.resumeText,
    req.body.jobDescription,
    language
  );
  await cacheSet(cacheKey, result, 1800);
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  res.json({ success: true, data: result });
});

export const exportPDF = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await findOwnResume(String(req.params.id), req.user!.userId);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  const limits = user ? await getUserLimits(user) : { watermarkPdf: true };

  const pdfBuffer = await generateResumePDF(resume.content as unknown as IResumeContent, {
    watermark: limits.watermarkPdf,
    format: resume.format,
    templateId: resume.templateId,
    theme: resume.theme as Record<string, string>,
  });

  await prisma.resume.update({ where: { id: resume.id }, data: { lastExportedAt: new Date() } });
  await trackEvent("pdfExports");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${resume.slug}.pdf"`
  );
  res.send(pdfBuffer);
});

export const togglePublic = asyncHandler(async (req: AuthRequest, res: Response) => {
  const current = await findOwnResume(String(req.params.id), req.user!.userId);

  const isPublic = !current.isPublic;
  const resume = await prisma.resume.update({
    where: { id: current.id },
    data: {
      isPublic,
      ...(isPublic && !current.publicSlug && { publicSlug: generateUniqueSlug(current.title) }),
    },
  });

  res.json({
    success: true,
    data: {
      isPublic: resume.isPublic,
      publicUrl: resume.isPublic
        ? `${config.siteUrl}/r/${resume.publicSlug}`
        : null,
    },
  });
});

export const getPublicResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const found = await prisma.resume.findFirst({ where: { publicSlug: String(req.params.slug), isPublic: true }, select: { id: true } });
  if (!found) throw new ApiError(404, "Resume not found");

  const resume = await prisma.resume.update({ where: { id: found.id }, data: { viewCount: { increment: 1 } } });

  res.json({
    success: true,
    data: {
      title: resume.title,
      content: resume.content,
      templateId: resume.templateId,
      format: resume.format,
      language: resume.language,
    },
  });
});

export const duplicateResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const original = await findOwnResume(String(req.params.id), req.user!.userId);

  const user = await loadUser(req.user!.userId);
  await checkResumeLimit(user, await countResumes(user.id));

  const copy = await prisma.resume.create({
    data: {
      userId: user.id,
      title: `${original.title} (Copy)`,
      slug: generateUniqueSlug(`${original.title}-copy`),
      templateId: original.templateId,
      format: original.format,
      content: asJson(original.content),
      language: normalizeLanguage(original.language),
      theme: asJson(original.theme),
      sectionOrder: asJson(original.sectionOrder),
    },
  });

  res.status(201).json({ success: true, data: serializeResume(copy) });
});

export const reorderSections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sectionOrder } = req.body;
  await findOwnResume(String(req.params.id), req.user!.userId);
  const resume = await prisma.resume.update({
    where: { id: String(req.params.id) },
    data: { sectionOrder: asJson(sectionOrder) },
  });
  res.json({ success: true, data: serializeResume(resume) });
});

export const addExperience = asyncHandler(async (req: AuthRequest, res: Response) => {
  const current = await findOwnResume(String(req.params.id), req.user!.userId);
  const exp = req.body as ResumeContentInput["experience"][number];
  const content = withContentDefaults(current.content as unknown as IResumeContent);
  content.experience.push({ ...exp, id: uuidv4(), bullets: exp.bullets || [] } as IResumeContent["experience"][number]);
  const resume = await prisma.resume.update({ where: { id: current.id }, data: { content: asJson(content) } });
  res.json({ success: true, data: serializeResume(resume) });
});

const BANGLA = /[ঀ-৿]/g;

type UploadFields = Pick<
  Prisma.ResumeUncheckedCreateInput,
  "uploadedFileName" | "uploadedFilePath" | "uploadedFileUrl" | "uploadedFileMimeType" | "uploadedFileSize"
>;

/**
 * Parses CV text with the AI and writes it into an existing CV (replacing its
 * content) or a new one. Shared by file upload and pasted text (e.g. LinkedIn).
 */
const importCvText = async (
  user: User,
  input: { text: string; resumeId?: string; title: string; uploadFields?: UploadFields }
) => {
  const resumeId = input.resumeId;
  if (resumeId) await findOwnResume(resumeId, user.id);
  else await checkResumeLimit(user, await countResumes(user.id));
  await checkAiLimit(user);

  const parsedContent = withContentDefaults(normalizeParsedResumeContent(await geminiService.parseResume(input.text)));
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  const fields = {
    content: asJson(parsedContent),
    uploadedResumeText: input.text,
    uploadedAt: new Date(),
    ...input.uploadFields,
  };
  if (resumeId) {
    return prisma.resume.update({ where: { id: resumeId }, data: fields });
  }

  // Mostly-Bangla source text becomes a Bangla CV (headings, dates)
  const banglaShare = (input.text.match(BANGLA)?.length ?? 0) / Math.max(1, input.text.replace(/\s/g, "").length);
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: input.title,
      slug: generateUniqueSlug(input.title),
      templateId: "modern-ats",
      format: "ats",
      language: banglaShare > 0.3 ? "bn" : normalizeLanguage(user.language || "en"),
      theme: asJson(DEFAULT_THEME),
      sectionOrder: asJson(DEFAULT_SECTION_ORDER),
      ...fields,
    },
  });
  await countCreatedResume(user.id);
  await trackEvent("resumesUploaded");
  return resume;
};

export const importFromText = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadUser(req.user!.userId);
  const resume = await importCvText(user, {
    text: req.body.text,
    resumeId: req.body.resumeId,
    title: "Imported CV",
    uploadFields: { uploadedFileName: null, uploadedFileUrl: null, uploadedFilePath: null },
  });
  res.json({ success: true, data: { resumeId: resume.id, title: resume.title, content: resume.content } });
});

export const uploadAndParseResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const user = await loadUser(req.user!.userId);
  await checkAiLimit(user);

  const resumeText = await extractCvText(req.file.buffer, req.file.originalname, req.file.mimetype);

  // Keeping the original file is optional: it needs Cloudinary
  const stored = await uploadBuffer(req.file.buffer, "aicvbuilderbd/resumes", "raw", {
    resource_type: "raw",
    use_filename: true,
    unique_filename: true,
    filename_override: req.file.originalname,
  }).catch((error: Error) => {
    console.warn("Storing uploaded CV failed:", error.message);
    return null;
  });

  const resumeId = typeof req.body.resumeId === "string" && req.body.resumeId ? req.body.resumeId : undefined;
  const resume = await importCvText(user, {
    text: resumeText,
    resumeId,
    title: req.file.originalname.replace(/\.(pdf|docx)$/i, "").slice(0, 50) || "Imported CV",
    uploadFields: {
      uploadedFileName: req.file.originalname,
      uploadedFilePath: stored?.publicId ?? null,
      uploadedFileUrl: stored?.url ?? null,
      uploadedFileMimeType: req.file.mimetype,
      uploadedFileSize: req.file.size,
    },
  });

  res.json({
    success: true,
    data: {
      resumeId: resume.id,
      title: resume.title,
      content: resume.content,
      uploadedAt: resume.uploadedAt,
      hasUploadedResume: !!resume.uploadedResumeText,
      uploadedFileName: resume.uploadedFileName,
      uploadedFileUrl: resume.uploadedFileUrl,
    },
  });
});

export const downloadUploadedResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await findOwnResume(String(req.params.id), req.user!.userId);

  if (resume.uploadedFileUrl && /^https?:\/\//.test(resume.uploadedFileUrl)) {
    return res.redirect(resume.uploadedFileUrl);
  }

  if (!resume.uploadedFilePath || !fs.existsSync(resume.uploadedFilePath)) {
    throw new ApiError(404, "Uploaded resume file not found");
  }

  res.download(resume.uploadedFilePath, resume.uploadedFileName || "uploaded-resume.pdf");
});
