import { z } from "zod";

export const createResumeSchema = z.object({
  title: z.string().min(1).max(200),
  templateId: z.string().optional(),
  format: z.enum(["international", "bangladeshi", "ats"]).optional(),
  language: z.enum(["en", "bn"]).optional(),
});

export const updateResumeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  templateId: z.string().optional(),
  format: z.enum(["international", "bangladeshi", "ats"]).optional(),
  content: z.record(z.unknown()).optional(),
  sectionOrder: z.array(z.string()).optional(),
  theme: z.record(z.string()).optional(),
  isPublic: z.boolean().optional(),
  language: z.enum(["en", "bn"]).optional(),
});

export const generateResumeSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().min(1),
  skills: z.string().min(1),
  experience: z.string().min(1),
  education: z.string().min(1),
  projects: z.string().optional().default(""),
  language: z.enum(["en", "bn"]).optional().default("en"),
  resumeId: z.string().optional(),
});

export const tailorResumeSchema = z.object({
  resumeId: z.string().optional(),
  jobDescription: z.string().min(20),
  language: z.enum(["en", "bn"]).optional().default("en"),
  content: z.record(z.unknown()).optional(),
});

export const improveResumeSchema = z.object({
  resumeText: z.string().min(50),
  jobDescription: z.string().min(20),
  language: z.enum(["en", "bn"]).optional().default("en"),
  resumeId: z.string().optional(),
});

export const atsCheckSchema = z.object({
  resumeText: z.string().min(50),
  jobDescription: z.string().optional(),
  language: z.enum(["en", "bn"]).optional(),
});
