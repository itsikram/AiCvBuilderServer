import { Response } from "express";
import { CoverLetter } from "../models/CoverLetter.js";
import { Resume } from "../models/Resume.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { geminiService } from "../services/ai/gemini.service.js";
import {
  checkFeatureAccess,
  checkAiLimit,
  incrementAiUsage,
} from "../services/subscription.service.js";
import { generateCoverLetterPDF } from "../services/pdf.service.js";
import { trackEvent } from "../services/analytics.service.js";

const buildResumeSummary = (resume: any) => {
  const content = resume?.content ?? {};
  const personalInfo = content.personalInfo ?? {};
  const experience = Array.isArray(content.experience) ? content.experience : [];
  const education = Array.isArray(content.education) ? content.education : [];
  const skills = Array.isArray(content.skills) ? content.skills : [];

  const experienceLines = experience.slice(0, 4).map((item: any) => {
    const company = item?.company ? ` at ${item.company}` : "";
    const role = item?.position ? `${item.position}` : "";
    const dates = item?.startDate ? `${item.startDate}${item?.endDate ? ` - ${item.endDate}` : ""}` : "";
    const bullets = Array.isArray(item?.bullets) ? item.bullets.filter(Boolean).join(" ") : "";
    return [role, company, dates, bullets].filter(Boolean).join(" | ");
  });

  const educationLines = education.slice(0, 3).map((item: any) => {
    const degree = item?.degree ? `${item.degree}` : "";
    const institution = item?.institution ? ` at ${item.institution}` : "";
    const dates = item?.startDate ? `${item.startDate}${item?.endDate ? ` - ${item.endDate}` : ""}` : "";
    return [degree, institution, dates].filter(Boolean).join(" | ");
  });

  return [
    `Name: ${personalInfo.fullName || ""}`,
    `Email: ${personalInfo.email || ""}`,
    `Phone: ${personalInfo.phone || ""}`,
    `Location: ${personalInfo.location || ""}`,
    `Summary: ${personalInfo.summary || ""}`,
    `Skills: ${skills.join(", ")}`,
    `Experience: ${experienceLines.join("\n")}`,
    `Education: ${educationLines.join("\n")}`,
  ]
    .filter((line) => line && !line.endsWith(": "))
    .join("\n");
};

export const getCoverLetters = asyncHandler(async (req: AuthRequest, res: Response) => {
  const letters = await CoverLetter.find({ userId: req.user!.userId }).sort({ updatedAt: -1 });
  res.json({ success: true, data: letters });
});

export const generateCoverLetter = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  await checkFeatureAccess(user, "coverLetters");
  await checkAiLimit(user);

  let resumeSummary = "";
  if (req.body.resumeId) {
    const resume = await Resume.findOne({ _id: req.body.resumeId, userId: user._id });
    resumeSummary = buildResumeSummary(resume);
  }

  const result = await geminiService.generateCoverLetter({
    name: user.name,
    jobTitle: req.body.jobTitle,
    companyName: req.body.companyName,
    resumeSummary,
    jobDescription: req.body.jobDescription,
    language: req.body.language,
  });

  const letter = await CoverLetter.create({
    userId: user._id,
    title: `Cover Letter - ${req.body.companyName}`,
    companyName: req.body.companyName,
    jobTitle: req.body.jobTitle,
    content: result.fullLetter,
    language: req.body.language,
    resumeId: req.body.resumeId,
  });

  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  res.status(201).json({ success: true, data: { letter, generated: result } });
});

export const exportCoverLetterPDF = asyncHandler(async (req: AuthRequest, res: Response) => {
  const letter = await CoverLetter.findOne({ _id: req.params.id, userId: req.user!.userId });
  if (!letter) throw new ApiError(404, "Cover letter not found");

  const user = await User.findById(req.user!.userId);
  const pdf = await generateCoverLetterPDF(letter.content, {
    name: user?.name || "",
    company: letter.companyName,
    jobTitle: letter.jobTitle,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="cover-letter-${letter._id}.pdf"`);
  res.send(pdf);
});

export const deleteCoverLetter = asyncHandler(async (req: AuthRequest, res: Response) => {
  await CoverLetter.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
  res.json({ success: true, message: "Deleted" });
});
