import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Resume } from "../models/Resume.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { generateUniqueSlug } from "../utils/slug.js";
import { geminiService } from "../services/ai/gemini.service.js";
import {
  checkResumeLimit,
  checkAiLimit,
  incrementAiUsage,
  checkFeatureAccess,
  getUserLimits,
} from "../services/subscription.service.js";
import { User } from "../models/User.js";
import { generateResumePDF } from "../services/pdf.service.js";
import { trackEvent } from "../services/analytics.service.js";
import { cacheGet, cacheSet } from "../config/redis.js";
import * as pdfParse from "pdf-parse";

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
  const resume = await Resume.create({
    userId: user._id,
    title,
    slug: generateUniqueSlug(title),
    templateId: templateId || "modern-ats",
    format: format || "ats",
    language: language || user.language,
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
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { $set: req.body },
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
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { $set: { templateId } },
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

  const result = await geminiService.generateResume(req.body);
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  if (req.body.resumeId) {
    const resume = await Resume.findOne({
      _id: req.body.resumeId,
      userId: user._id,
    });
    if (resume) {
      resume.content.personalInfo.summary = result.summary;
      resume.content.skills = result.skills;
      await resume.save();
    }
  }

  res.json({ success: true, data: result });
});

export const improveWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkFeatureAccess(user, "aiOptimization");
  await checkAiLimit(user);

  const result = await geminiService.improveResume(
    req.body.resumeText,
    req.body.jobDescription,
    req.body.language
  );
  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  if (req.body.resumeId) {
    await Resume.findByIdAndUpdate(req.body.resumeId, {
      atsScore: result.atsScore,
      atsFeedback: result.suggestions,
    });
  }

  res.json({ success: true, data: result });
});

export const checkATS = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkFeatureAccess(user, "atsChecker");
  await checkAiLimit(user);

  const cacheKey = `ats:${Buffer.from(req.body.resumeText).toString("base64").slice(0, 50)}`;
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached, cached: true });
    return;
  }

  const result = await geminiService.checkATS(
    req.body.resumeText,
    req.body.jobDescription
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
        ? `${process.env.CLIENT_URL}/r/${resume.publicSlug}`
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
    language: original.language,
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
  resume.content.experience.push({ id: uuidv4(), ...req.body, bullets: req.body.bullets || [] });
  await resume.save();
  res.json({ success: true, data: resume });
});

export const uploadAndParseResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const buffer = req.file.buffer;
  const data = await (pdfParse as any).default(buffer);
  const text = data.text;

  // Use AI to parse the resume text into structured format
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");

  const parsedContent = await geminiService.parseResume(text);

  res.json({
    success: true,
    data: parsedContent,
  });
});
