import { z } from "zod";

export const generateCoverLetterSchema = z.object({
  companyName: z.string().min(1),
  jobTitle: z.string().min(1),
  jobDescription: z.string().min(20),
  resumeId: z.string().optional(),
  language: z.enum(["en", "bn"]).optional().default("en"),
});
