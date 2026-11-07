import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { IResumeContent, asJson, serializeResume, withContentDefaults } from "../models/Resume.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { COACH_EDIT_MAX, geminiService } from "../services/ai/gemini.service.js";
import { cvToText } from "../services/ai/cvText.js";
import { chatTranscript } from "../services/ai/chat.js";
import { applyCvEdits, coachFields, fieldsToPrompt, toCvEdits } from "../services/ai/cvFields.js";
import { withAiQuota } from "./resumeAi.controller.js";
import type {
  applyEditsSchema,
  coachChatSchema,
  interviewFeedbackSchema,
  interviewQuestionsSchema,
} from "../validators/resume.validator.js";

type Body<S extends z.ZodTypeAny> = z.infer<S>;

/** The caller's saved CV, or undefined when none was chosen. */
const savedContent = async (req: AuthRequest, resumeId: string | undefined): Promise<IResumeContent | undefined> => {
  if (!resumeId) return undefined;
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId: req.user!.userId } });
  if (!resume) throw new ApiError(404, "Resume not found");
  return withContentDefaults(resume.content as unknown as IResumeContent);
};

export const interviewQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof interviewQuestionsSchema>;
  const content = await savedContent(req, body.resumeId);
  const jobTitle = body.jobTitle || content?.personalInfo?.jobTitle || "";
  if (!jobTitle && !body.jobDescription) {
    throw new ApiError(400, "Enter the job title you're interviewing for, or paste the job post.");
  }

  const data = await withAiQuota(req, () =>
    geminiService.interviewQuestions({
      cvText: cvToText(content, 6000),
      jobTitle,
      jobDescription: body.jobDescription,
      focus: body.focus,
      count: body.count,
      language: body.language,
    })
  );
  const questions = data.questions
    .filter((q) => q.question.trim())
    .map((q, i) => ({ id: `q${i}`, ...q, tips: q.tips.filter((tip) => tip.trim()) }));
  res.json({ success: true, data: { jobTitle, questions, prepTips: data.prepTips.filter((tip) => tip.trim()) } });
});

export const interviewFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof interviewFeedbackSchema>;
  const content = await savedContent(req, body.resumeId);
  const data = await withAiQuota(req, () =>
    geminiService.evaluateAnswer({
      question: body.question,
      answer: body.answer,
      cvText: cvToText(content, 4000),
      jobTitle: body.jobTitle || content?.personalInfo?.jobTitle || "",
      jobDescription: body.jobDescription,
      language: body.language,
    })
  );
  res.json({ success: true, data: { ...data, score: Math.round(data.score) } });
});

/**
 * One reply from the career coach. The browser keeps the conversation and sends it
 * each time (nothing is stored); with a saved CV the coach can propose edits that
 * the user applies with POST /resumes/:id/apply-edits.
 */
export const coachChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Body<typeof coachChatSchema>;
  const content = await savedContent(req, body.resumeId);
  const fields = content ? coachFields(content) : [];

  // Validated inside the quota call, so an unusable answer is an error and isn't counted
  const data = await withAiQuota(req, async () => {
    const result = await geminiService.coachChat({
      transcript: chatTranscript(body.messages),
      hasCv: Boolean(content),
      cvText: cvToText(content, 6000),
      fields: fieldsToPrompt(fields),
      jobDescription: body.jobDescription,
      language: body.language,
    });
    // An edit at the length cap was cut off by the schema; applying it would lose the rest of the field
    const edits = content
      ? toCvEdits(result.edits, fields, content.skills).filter((edit) => edit.after.length < COACH_EDIT_MAX)
      : [];
    const reply = result.reply.trim() || (edits.length ? EDITS_ONLY_REPLY[body.language] : "");
    // An empty reply would also break the chat: the client resends it and the validator rejects empty messages
    if (!reply) throw new ApiError(502, "The AI returned an unexpected answer. Please try again.");
    return { reply, edits, suggestions: result.suggestions.map((s) => s.trim()).filter(Boolean) };
  });
  res.json({ success: true, data });
});

const EDITS_ONLY_REPLY = {
  en: "Here are my suggested changes to your CV. Review them below and apply the ones you like.",
  bn: "আপনার সিভির জন্য আমার পরামর্শ দেওয়া পরিবর্তনগুলো নিচে দেওয়া হলো। দেখে নিয়ে পছন্দেরগুলো বসিয়ে দিন।",
} as const;

/** Applies AI edits the user approved to their saved CV; edits whose field changed since are skipped. */
export const applyEdits = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { edits } = req.body as Body<typeof applyEditsSchema>;
  const resume = await prisma.resume.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!resume) throw new ApiError(404, "Resume not found");

  const result = applyCvEdits(withContentDefaults(resume.content as unknown as IResumeContent), edits);
  const updated = result.applied
    ? await prisma.resume.update({ where: { id: resume.id }, data: { content: asJson(result.content) } })
    : resume;
  res.json({
    success: true,
    data: { resume: serializeResume(updated), results: result.results, applied: result.applied, skipped: result.skipped },
  });
});
