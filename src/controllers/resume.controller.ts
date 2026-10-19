import { Response } from "express";
import fs from "fs";
import { createHash } from "crypto";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { IResumeContent, Resume } from "../models/Resume.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { generateUniqueSlug } from "../utils/slug.js";
import { normalizeLanguage } from "../utils/language.js";
import { config } from "../config/index.js";
import { geminiService, type ParsedCv } from "../services/ai/gemini.service.js";
import { cvToText } from "../services/ai/cvText.js";
import {
  checkResumeLimit,
  checkAiLimit,
  incrementAiUsage,
  checkFeatureAccess,
  getUserLimits,
} from "../services/subscription.service.js";
import { IUser, User } from "../models/User.js";
import { Template } from "../models/Template.js";
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

const resolveTemplateForUser = async (templateId: string, user: IUser) => {
  const template = await Template.findOne({ slug: templateId, isActive: true });
  if (!template) throw new ApiError(404, "Template not found");

  const limits = await getUserLimits(user);
  if (template.isPremium && !limits.premiumTemplates) {
    throw new ApiError(403, "Upgrade to Premium to use this template");
  }

  return template;
};

export const getResumes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resumes = await Resume.find({ userId: req.user!.userId })
    .sort({ updatedAt: -1 })
    .select("-__v");
  res.json({ success: true, data: resumes });
});

export const getResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");
  res.json({ success: true, data: resume });
});

export const createResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");

  const count = await Resume.countDocuments({ userId: user._id });
  await checkResumeLimit(user, count);

  const { title, templateId, format, language } = req.body;
  const template = await resolveTemplateForUser(templateId || "modern-ats", user);
  const resolvedLanguage = normalizeLanguage(language || user.language);
  const resume = await Resume.create({
    userId: user._id,
    title,
    slug: generateUniqueSlug(title),
    templateId: template.slug,
    format: format || "ats",
    language: resolvedLanguage,
    theme: template.defaultTheme || {},
    content: {
      personalInfo: {
        fullName: user.name,
        email: user.email,
        phone: "",
        location: "Dhaka, Bangladesh",
        summary: "",
      },
      experience: [],
      education: [],
      projects: [],
      skills: [],
      languages: [
        { id: uuidv4(), name: "Bangla", proficiency: "native" },
        { id: uuidv4(), name: "English", proficiency: "fluent" },
      ],
      certifications: [],
      awards: [],
      publications: [],
      volunteerExperience: [],
      references: [],
      interests: [],
      courses: [],
      memberships: [],
      customSections: [],
    },
  });

  user.usage.resumesCreated += 1;
  await user.save();
  await trackEvent("resumesCreated");

  res.status(201).json({ success: true, data: resume });
});

export const updateResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Only whitelisted, validated fields reach the database (validate() replaced req.body)
  const update = { ...(req.body as UpdateResumeInput) };
  if (update.templateId) {
    const user = await User.findById(req.user!.userId);
    if (!user) throw new ApiError(404, "User not found");
    update.templateId = (await resolveTemplateForUser(update.templateId, user)).slug;
  }
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!resume) throw new ApiError(404, "Resume not found");
  res.json({ success: true, data: resume });
});

export const updateTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { templateId } = req.body;
  if (!templateId) {
    throw new ApiError(400, "templateId is required");
  }
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  const template = await resolveTemplateForUser(templateId, user);
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { $set: { templateId: template.slug, theme: template.defaultTheme || {} } },
    { new: true }
  );
  if (!resume) throw new ApiError(404, "Resume not found");
  res.json({ success: true, data: resume });
});

export const deleteResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await Resume.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!.userId,
  });
  if (!resume) throw new ApiError(404, "Resume not found");
  res.json({ success: true, message: "Resume deleted" });
});

export const generateWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkAiLimit(user);

  const language = normalizeLanguage(req.body.language || user.language);
  const result = await geminiService.generateResume({ ...req.body, language });
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  // The client applies suggestions it receives; nothing is written to the CV here.
  res.json({ success: true, data: result });
});

export const tailorResumeWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkAiLimit(user);

  const resumeId = req.body.resumeId as string | undefined;
  const resume = resumeId ? await Resume.findOne({ _id: resumeId, userId: user._id }) : null;
  if (resumeId && !resume) throw new ApiError(404, "Resume not found");

  const cvText = cvToText(req.body.content ?? resume?.content);
  if (!cvText.trim()) throw new ApiError(400, "Add some CV content before tailoring it to a job.");

  const language = normalizeLanguage(req.body.language || user.language);
  const result = await geminiService.tailorResume(cvText, req.body.jobDescription, language);

  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  // Suggestions are returned for the user to approve; the saved CV is not changed.
  res.json({ success: true, data: result });
});

export const improveWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
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
    await Resume.updateOne(
      { _id: req.body.resumeId, userId: user._id },
      { atsScore: result.atsScore, atsFeedback: result.suggestions }
    );
  }

  res.json({ success: true, data: result });
});

export const checkATS = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
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
  const resume = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");

  const user = await User.findById(req.user!.userId);
  const limits = user ? await getUserLimits(user) : { watermarkPdf: true };

  const pdfBuffer = await generateResumePDF(resume.content, {
    watermark: limits.watermarkPdf,
    format: resume.format,
    templateId: resume.templateId,
    theme: resume.theme,
  });

  resume.lastExportedAt = new Date();
  await resume.save();
  await trackEvent("pdfExports");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${resume.slug}.pdf"`
  );
  res.send(pdfBuffer);
});

export const togglePublic = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");

  resume.isPublic = !resume.isPublic;
  if (resume.isPublic && !resume.publicSlug) {
    resume.publicSlug = generateUniqueSlug(resume.title);
  }
  await resume.save();

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
  const resume = await Resume.findOne({ publicSlug: req.params.slug, isPublic: true });
  if (!resume) throw new ApiError(404, "Resume not found");

  resume.viewCount += 1;
  await resume.save();

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
  const original = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!original) throw new ApiError(404, "Resume not found");

  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  const count = await Resume.countDocuments({ userId: user._id });
  await checkResumeLimit(user, count);

  const copy = await Resume.create({
    userId: user._id,
    title: `${original.title} (Copy)`,
    slug: generateUniqueSlug(`${original.title}-copy`),
    templateId: original.templateId,
    format: original.format,
    content: original.content,
    language: normalizeLanguage(original.language),
    theme: original.theme,
    sectionOrder: original.sectionOrder,
  });

  res.status(201).json({ success: true, data: copy });
});

export const reorderSections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sectionOrder } = req.body;
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { sectionOrder },
    { new: true }
  );
  if (!resume) throw new ApiError(404, "Resume not found");
  res.json({ success: true, data: resume });
});

export const addExperience = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");
  const exp = req.body as ResumeContentInput["experience"][number];
  resume.content.experience.push({ ...exp, id: uuidv4(), bullets: exp.bullets || [] });
  await resume.save();
  res.json({ success: true, data: resume });
});

export const uploadAndParseResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkAiLimit(user);

  const resumeText = await extractCvText(req.file.buffer, req.file.originalname, req.file.mimetype);
  const parsedContent = normalizeParsedResumeContent(await geminiService.parseResume(resumeText));
  await incrementAiUsage(user);

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

  const uploadFields = {
    uploadedResumeText: resumeText,
    uploadedFileName: req.file.originalname,
    uploadedFilePath: stored?.publicId ?? null,
    uploadedFileUrl: stored?.url ?? null,
    uploadedFileMimeType: req.file.mimetype,
    uploadedFileSize: req.file.size,
    uploadedAt: new Date(),
  };

  const resumeId = req.body.resumeId as string | undefined;
  let resume;
  if (resumeId) {
    if (!/^[a-fd]{24}$/i.test(resumeId)) throw new ApiError(400, "Invalid id");
    resume = await Resume.findOneAndUpdate(
      { _id: resumeId, userId: user._id },
      { content: parsedContent, ...uploadFields },
      { new: true }
    );
    if (!resume) throw new ApiError(404, "Resume not found");
  } else {
    const count = await Resume.countDocuments({ userId: user._id });
    await checkResumeLimit(user, count);
    const titleFromFile = req.file.originalname.replace(/.(pdf|docx)$/i, "").slice(0, 50) || "Imported CV";
    resume = await Resume.create({
      userId: user._id,
      title: titleFromFile,
      slug: generateUniqueSlug(titleFromFile),
      templateId: "modern-ats",
      format: "ats",
      language: normalizeLanguage(user.language || "en"),
      content: parsedContent,
      ...uploadFields,
    });
    user.usage.resumesCreated += 1;
    await user.save();
    await trackEvent("resumesUploaded");
  }

  res.json({
    success: true,
    data: {
      resumeId: resume._id,
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
  const resume = await Resume.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!resume) throw new ApiError(404, "Resume not found");

  if (resume.uploadedFileUrl && /^https?:\/\//.test(resume.uploadedFileUrl)) {
    return res.redirect(resume.uploadedFileUrl);
  }

  if (!resume.uploadedFilePath || !fs.existsSync(resume.uploadedFilePath)) {
    throw new ApiError(404, "Uploaded resume file not found");
  }

  res.download(resume.uploadedFilePath, resume.uploadedFileName || "uploaded-resume.pdf");
});
