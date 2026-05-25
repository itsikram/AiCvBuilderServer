import { Response } from "express";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { IResumeContent, Resume } from "../models/Resume.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { generateUniqueSlug } from "../utils/slug.js";
import { normalizeLanguage } from "../utils/language.js";
import { geminiService } from "../services/ai/gemini.service.js";
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
import { extractPdfText } from "../services/pdf-extraction.service.js";
import { uploadBuffer } from "../services/cloudinary.service.js";

type ParsedResumeContent = Omit<
  IResumeContent,
  | "experience"
  | "education"
  | "projects"
  | "languages"
  | "certifications"
  | "awards"
  | "publications"
  | "volunteerExperience"
  | "references"
  | "courses"
  | "memberships"
> & {
  experience?: Array<Omit<IResumeContent["experience"][number], "id">>;
  education?: Array<Omit<IResumeContent["education"][number], "id">>;
  projects?: Array<Omit<IResumeContent["projects"][number], "id">>;
  languages?: Array<Omit<IResumeContent["languages"][number], "id">>;
  certifications?: Array<Omit<IResumeContent["certifications"][number], "id">>;
  awards?: Array<Omit<IResumeContent["awards"][number], "id">>;
  publications?: Array<Omit<IResumeContent["publications"][number], "id">>;
  volunteerExperience?: Array<Omit<IResumeContent["volunteerExperience"][number], "id">>;
  references?: Array<Omit<IResumeContent["references"][number], "id">>;
  courses?: Array<Omit<IResumeContent["courses"][number], "id">>;
  memberships?: Array<Omit<IResumeContent["memberships"][number], "id">>;
};

const hasTextValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasTextValue);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .filter(([key]) => key !== "id" && key !== "current")
      .some(([, nested]) => hasTextValue(nested));
  }
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().length > 0;
};

const withIds = <T extends Record<string, unknown>>(items: T[] | undefined) =>
  (items || [])
    .filter(hasTextValue)
    .map((item) => ({ id: uuidv4(), ...item }));

const normalizeParsedResumeContent = (parsed: ParsedResumeContent): IResumeContent => ({
  personalInfo: {
    fullName: parsed.personalInfo?.fullName || "",
    email: parsed.personalInfo?.email || "",
    phone: parsed.personalInfo?.phone || "",
    location: parsed.personalInfo?.location || "",
    linkedin: parsed.personalInfo?.linkedin || "",
    portfolio: parsed.personalInfo?.portfolio || "",
    github: parsed.personalInfo?.github || "",
    website: parsed.personalInfo?.website || "",
    summary: parsed.personalInfo?.summary || "",
    profilePhoto: parsed.personalInfo?.profilePhoto || "",
    profilePhotoSize: parsed.personalInfo?.profilePhotoSize === "small" || parsed.personalInfo?.profilePhotoSize === "large"
      ? parsed.personalInfo.profilePhotoSize
      : "medium",
    profilePhotoAlignment: parsed.personalInfo?.profilePhotoAlignment === "left" || parsed.personalInfo?.profilePhotoAlignment === "right"
      ? parsed.personalInfo.profilePhotoAlignment
      : "center",
  },
  experience: withIds(parsed.experience).map((exp) => ({
    company: String(exp.company || ""),
    position: String(exp.position || ""),
    location: String(exp.location || ""),
    startDate: String(exp.startDate || ""),
    endDate: String(exp.endDate || ""),
    current: Boolean(exp.current),
    bullets: Array.isArray(exp.bullets) ? exp.bullets.filter(Boolean).map(String) : [],
    id: exp.id,
  })),
  education: withIds(parsed.education).map((edu) => ({
    institution: String(edu.institution || ""),
    degree: String(edu.degree || ""),
    field: String(edu.field || ""),
    startDate: String(edu.startDate || ""),
    endDate: String(edu.endDate || ""),
    gpa: String(edu.gpa || ""),
    id: edu.id,
  })),
  projects: withIds(parsed.projects).map((project) => ({
    name: String(project.name || ""),
    description: String(project.description || ""),
    url: String(project.url || ""),
    technologies: Array.isArray(project.technologies)
      ? project.technologies.filter(Boolean).map(String)
      : [],
    id: project.id,
  })),
  skills: Array.isArray(parsed.skills) ? parsed.skills.filter(Boolean).map(String) : [],
  languages: withIds(parsed.languages).map((language) => ({
    name: String(language.name || ""),
    proficiency: ["native", "fluent", "intermediate", "basic"].includes(String(language.proficiency))
      ? language.proficiency
      : "intermediate",
    id: language.id,
  })),
  certifications: withIds(parsed.certifications).map((cert) => ({
    name: String(cert.name || ""),
    issuer: String(cert.issuer || ""),
    date: String(cert.date || ""),
    credentialId: String(cert.credentialId || ""),
    credentialUrl: String(cert.credentialUrl || ""),
    id: cert.id,
  })),
  awards: withIds(parsed.awards).map((award) => ({
    title: String(award.title || ""),
    issuer: String(award.issuer || ""),
    date: String(award.date || ""),
    description: String(award.description || ""),
    id: award.id,
  })),
  publications: withIds(parsed.publications).map((publication) => ({
    title: String(publication.title || ""),
    publisher: String(publication.publisher || ""),
    date: String(publication.date || ""),
    url: String(publication.url || ""),
    description: String(publication.description || ""),
    id: publication.id,
  })),
  volunteerExperience: withIds(parsed.volunteerExperience).map((volunteer) => ({
    organization: String(volunteer.organization || ""),
    role: String(volunteer.role || ""),
    startDate: String(volunteer.startDate || ""),
    endDate: String(volunteer.endDate || ""),
    current: Boolean(volunteer.current),
    description: String(volunteer.description || ""),
    id: volunteer.id,
  })),
  references: withIds(parsed.references).map((reference) => ({
    name: String(reference.name || ""),
    position: String(reference.position || ""),
    company: String(reference.company || ""),
    email: String(reference.email || ""),
    phone: String(reference.phone || ""),
    relationship: String(reference.relationship || ""),
    id: reference.id,
  })),
  interests: Array.isArray(parsed.interests) ? parsed.interests.filter(Boolean).map(String) : [],
  courses: withIds(parsed.courses).map((course) => ({
    name: String(course.name || ""),
    provider: String(course.provider || ""),
    date: String(course.date || ""),
    certificateUrl: String(course.certificateUrl || ""),
    id: course.id,
  })),
  memberships: withIds(parsed.memberships).map((membership) => ({
    organization: String(membership.organization || ""),
    role: String(membership.role || ""),
    startDate: String(membership.startDate || ""),
    endDate: String(membership.endDate || ""),
    current: Boolean(membership.current),
    id: membership.id,
  })),
  customSections: (parsed.customSections || []).filter(hasTextValue).map((section) => ({
    title: section.title || "",
    content: section.content || "",
  })),
});

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
  const result = await geminiService.generateResume({
    ...req.body,
    language,
  });
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

export const tailorResumeWithAI = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkAiLimit(user);

  const resumeId = req.body.resumeId as string | undefined;
  const baseContent = req.body.content
    ? JSON.stringify(req.body.content)
    : undefined;

  const resume = resumeId
    ? await Resume.findOne({ _id: resumeId, userId: user._id })
    : null;

  if (!resume && !baseContent) {
    throw new ApiError(404, "Resume not found");
  }

  const currentResumeText = baseContent || JSON.stringify(resume?.content ?? {});
  const language = normalizeLanguage(req.body.language || user.language);
  const result = await geminiService.tailorResume(
    currentResumeText,
    req.body.jobDescription,
    language
  );

  if (resume) {
    resume.content.personalInfo.summary = result.summary || resume.content.personalInfo.summary;
    resume.content.skills = result.skills?.length ? result.skills : resume.content.skills;

    if (result.experienceBullets?.length) {
      resume.content.experience = resume.content.experience.map((experience, index) => {
        const tailored = result.experienceBullets[index];
        if (tailored?.bullets?.length) {
          return { ...experience, bullets: tailored.bullets };
        }
        return experience;
      });
    }

    resume.atsFeedback = result.suggestions || resume.atsFeedback;
    await resume.save();
  }

  await incrementAiUsage(user);
  await trackEvent("aiRequests");

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

  const language = normalizeLanguage(req.body.language || user.language);
  const cacheKey = `ats:${Buffer.from(req.body.resumeText).toString("base64").slice(0, 50)}`;
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
  resume.content.experience.push({ id: uuidv4(), ...req.body, bullets: req.body.bullets || [] });
  await resume.save();
  res.json({ success: true, data: resume });
});

export const uploadAndParseResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const cloudinaryFile = await uploadBuffer(req.file.buffer, "chakricv/resumes", "raw", {
    resource_type: "raw",
    use_filename: true,
    unique_filename: true,
    filename_override: req.file.originalname,
  });

  if (!cloudinaryFile) {
    throw new ApiError(500, "Cloudinary is not configured");
  }

  const resumeText = await extractPdfText(req.file.buffer, req.file.originalname);

  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");

  const resumeId = req.body.resumeId as string | undefined;
  const parsedContent = normalizeParsedResumeContent(await geminiService.parseResume(resumeText));

  let resume;

  if (resumeId) {
    resume = await Resume.findOneAndUpdate(
      { _id: resumeId, userId: user._id },
      {
        content: parsedContent,
        uploadedResumeText: resumeText,
        uploadedFileName: req.file.originalname,
        uploadedFilePath: cloudinaryFile.publicId,
        uploadedFileUrl: cloudinaryFile.url,
        uploadedFileMimeType: req.file.mimetype,
        uploadedFileSize: req.file.size,
        uploadedAt: new Date(),
      },
      { new: true }
    );
    if (!resume) throw new ApiError(404, "Resume not found");
  } else {
    const titleFromFile = req.file.originalname.replace(".pdf", "").slice(0, 50);
    resume = await Resume.create({
      userId: user._id,
      title: titleFromFile || "Uploaded Resume",
      slug: generateUniqueSlug(titleFromFile || "Uploaded Resume"),
      templateId: "modern-ats",
      format: "ats",
      language: normalizeLanguage(user.language || "en"),
      content: parsedContent,
      uploadedResumeText: resumeText,
      uploadedFileName: req.file.originalname,
      uploadedFilePath: cloudinaryFile.publicId,
      uploadedFileUrl: cloudinaryFile.url,
      uploadedFileMimeType: req.file.mimetype,
      uploadedFileSize: req.file.size,
      uploadedAt: new Date(),
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
