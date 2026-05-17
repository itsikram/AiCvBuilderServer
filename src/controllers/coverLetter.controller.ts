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
    resumeSummary = resume?.content.personalInfo.summary || "";
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
