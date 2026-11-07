import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { extractCvText } from "../services/pdf-extraction.service.js";
import { geminiService } from "../services/ai/gemini.service.js";
import { recordActivity } from "../services/activity.service.js";

// Employer CV screening: score candidate CVs against a job description. Each CV uses one
// screening credit (Products). Only the score and short notes are kept, never the CV itself,
// and screenings are deleted after RETENTION_DAYS (pruneScreenings).

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const createSchema = z.object({
  title: z.string().trim().min(2).max(255),
  jobDescription: z.string().trim().min(50, "Paste the full job description (at least 50 characters)").max(20_000),
});

const findOwn = async (req: AuthRequest) => {
  const screening = await prisma.screening.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!screening) throw new ApiError(404, "Screening not found");
  return screening;
};

const serializeCandidate = (candidate: {
  id: string;
  fileName: string;
  name: string | null;
  score: number;
  strengths: unknown;
  gaps: unknown;
  summary: string;
  createdAt: Date;
}) => ({ _id: candidate.id, ...candidate, strengths: candidate.strengths as string[], gaps: candidate.gaps as string[] });

export const listScreenings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [screenings, user] = await Promise.all([
    prisma.screening.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: true } } },
    }),
    prisma.user.findUnique({ where: { id: req.user!.userId }, select: { screeningCredits: true } }),
  ]);
  res.json({
    success: true,
    data: {
      credits: user?.screeningCredits ?? 0,
      retentionDays: RETENTION_DAYS,
      screenings: screenings.map(({ _count, jobDescription: _jd, ...screening }) => ({
        _id: screening.id,
        ...screening,
        candidates: _count.candidates,
        deletesAt: new Date(screening.createdAt.getTime() + RETENTION_DAYS * DAY_MS),
      })),
    },
  });
});

export const createScreening = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0].message);
  const screening = await prisma.screening.create({ data: { ...parsed.data, userId: req.user!.userId } });
  res.status(201).json({ success: true, data: { _id: screening.id, ...screening, candidates: [] } });
});

export const getScreening = asyncHandler(async (req: AuthRequest, res: Response) => {
  const screening = await findOwn(req);
  const candidates = await prisma.screeningCandidate.findMany({ where: { screeningId: screening.id }, orderBy: [{ score: "desc" }, { createdAt: "asc" }] });
  res.json({ success: true, data: { _id: screening.id, ...screening, candidates: candidates.map(serializeCandidate) } });
});

export const deleteScreening = asyncHandler(async (req: AuthRequest, res: Response) => {
  const screening = await findOwn(req);
  await prisma.screening.delete({ where: { id: screening.id } });
  res.json({ success: true, message: "Screening deleted" });
});

/** Scores one uploaded CV (PDF or Word) against the screening's job. Uses one credit. */
export const scoreCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new ApiError(400, "Upload a CV (PDF or Word)");
  const screening = await findOwn(req);
  const userId = req.user!.userId;

  // Take the credit first so parallel uploads can't overspend; give it back if scoring fails
  const { count } = await prisma.user.updateMany({ where: { id: userId, screeningCredits: { gt: 0 } }, data: { screeningCredits: { decrement: 1 } } });
  if (!count) throw new ApiError(402, "You have no CV screening credits left. Buy a screening pack to continue.");
  try {
    const text = await extractCvText(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (text.trim().length < 50) throw new ApiError(422, "We couldn't read text from this file. Is it a scanned image?");
    const result = await geminiService.scoreCandidate(text, screening.jobDescription);
    const candidate = await prisma.screeningCandidate.create({
      data: {
        screeningId: screening.id,
        fileName: req.file.originalname.slice(0, 255),
        name: result.name?.trim() || null,
        score: Math.round(result.score),
        strengths: result.strengths,
        gaps: result.gaps,
        summary: result.summary,
      },
    });
    recordActivity({
      userId,
      type: "screening.scored",
      message: `Screened a CV for "${screening.title}" (score ${candidate.score})`,
      metadata: { screeningId: screening.id },
      req,
    });
    const left = await prisma.user.findUnique({ where: { id: userId }, select: { screeningCredits: true } });
    res.status(201).json({ success: true, data: { candidate: serializeCandidate(candidate), credits: left?.screeningCredits ?? 0 } });
  } catch (error) {
    await prisma.user.update({ where: { id: userId }, data: { screeningCredits: { increment: 1 } } });
    throw error;
  }
});

/** Deletes screenings (and their scores) older than the retention period. */
export const pruneScreenings = async () => {
  const { count } = await prisma.screening.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * DAY_MS) } } });
  return count;
};
