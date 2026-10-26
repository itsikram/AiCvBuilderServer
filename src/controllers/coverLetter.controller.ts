import { Response } from "express";
import { prisma } from "../config/database.js";
import type { IResumeContent } from "../models/Resume.js";
import { serializeCoverLetter } from "../models/serializers.js";
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
import { cvToText } from "../services/ai/cvText.js";
import { trackEvent } from "../services/analytics.service.js";
import { normalizeLanguage } from "../utils/language.js";

export const getCoverLetters = asyncHandler(async (req: AuthRequest, res: Response) => {
  const letters = await prisma.coverLetter.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ success: true, data: letters.map(serializeCoverLetter) });
});

export const generateCoverLetter = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new ApiError(404, "User not found");
  await checkFeatureAccess(user, "coverLetters");
  await checkAiLimit(user);

  let resumeSummary = "";
  if (req.body.resumeId) {
    const resume = await prisma.resume.findFirst({ where: { id: req.body.resumeId, userId: user.id } });
    if (!resume) throw new ApiError(404, "Resume not found");
    resumeSummary = cvToText(resume.content as unknown as IResumeContent, 5000);
  }

  const result = await geminiService.generateCoverLetter({
    name: user.name,
    jobTitle: req.body.jobTitle,
    companyName: req.body.companyName,
    resumeSummary,
    jobDescription: req.body.jobDescription,
    language: req.body.language,
    tone: req.body.tone,
  });

  const letter = await prisma.coverLetter.create({
    data: {
      userId: user.id,
      title: `Cover Letter - ${req.body.companyName}`,
      companyName: req.body.companyName,
      jobTitle: req.body.jobTitle,
      content: result.fullLetter,
      language: normalizeLanguage(req.body.language),
      resumeId: req.body.resumeId || null,
    },
  });

  await incrementAiUsage(user);
  await trackEvent("aiRequests");

  res.status(201).json({ success: true, data: { letter: serializeCoverLetter(letter), generated: result } });
});

export const exportCoverLetterPDF = asyncHandler(async (req: AuthRequest, res: Response) => {
  const letter = await prisma.coverLetter.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!letter) throw new ApiError(404, "Cover letter not found");

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
  const pdf = await generateCoverLetterPDF(letter.content, {
    name: user?.name || "",
    company: letter.companyName,
    jobTitle: letter.jobTitle,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="cover-letter-${letter.id}.pdf"`);
  res.send(pdf);
});

export const deleteCoverLetter = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { count } = await prisma.coverLetter.deleteMany({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!count) throw new ApiError(404, "Cover letter not found");
  res.json({ success: true, message: "Deleted" });
});
