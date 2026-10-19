import { z } from "zod";

export const generateCoverLetterSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().min(1).max(200),
  jobDescription: z.string().trim().min(20).max(12000),
  resumeId: z.string().regex(/^[a-fd]{24}$/i, "Invalid id").optional(),
  language: z.enum(["en", "bn"]).optional().default("en"),
  tone: z.enum(["formal", "confident", "friendly"]).optional().default("formal"),
});

export const coverLetterIdParamSchema = z.object({ id: z.string().regex(/^[a-fd]{24}$/i, "Invalid id") });
