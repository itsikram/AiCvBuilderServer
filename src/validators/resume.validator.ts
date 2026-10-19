import { z } from "zod";

// Bounded strings keep a single CV document small and stop oversized payloads.
const short = (max = 200) => z.string().trim().max(max).optional().default("");
const long = (max = 5000) => z.string().max(max).optional().default("");
const id = z.string().max(64).optional().default("");
const list = <T extends z.ZodTypeAny>(item: T, max = 50) => z.array(item).max(max).optional().default([]);
const flag = z.boolean().optional().default(false);

// A profile photo is a data URL (resized in the browser to ~400 px) or an https URL
const photo = z
  .string()
  .max(700_000, "Profile photo is too large; please use a smaller image")
  .refine((v) => v === "" || v.startsWith("data:image/") || /^https:\/\//.test(v), "Invalid profile photo")
  .optional()
  .default("");

export const experienceItemSchema = z.object({
  id,
  company: short(200),
  position: short(200),
  location: short(200),
  startDate: short(40),
  endDate: short(40),
  current: flag,
  bullets: list(z.string().max(1000), 20),
});

export const resumeContentSchema = z.object({
  personalInfo: z
    .object({
      fullName: short(120),
      email: short(200),
      phone: short(40),
      location: short(200),
      linkedin: short(300),
      portfolio: short(300),
      github: short(300),
      website: short(300),
      summary: long(3000),
      jobTitle: short(120),
      profilePhoto: photo,
      profilePhotoSize: z.enum(["small", "medium", "large"]).optional().default("medium"),
      profilePhotoAlignment: z.enum(["left", "center", "right"]).optional().default("center"),
    })
    .default({}),
  careerObjective: long(2000),
  personalDetails: z
    .object({
      fatherName: short(120),
      motherName: short(120),
      dateOfBirth: short(40),
      gender: short(40),
      nationality: short(60),
      religion: short(60),
      maritalStatus: short(40),
      nid: short(40),
      bloodGroup: short(10),
      permanentAddress: short(400),
    })
    .optional(),
  experience: list(experienceItemSchema),
  education: list(
    z.object({
      id,
      institution: short(200),
      degree: short(200),
      field: short(200),
      startDate: short(40),
      endDate: short(40),
      gpa: short(40),
      level: short(40),
      board: short(120),
      gpaScale: short(10),
      passingYear: short(10),
    })
  ),
  trainings: list(
    z.object({
      id,
      title: short(200),
      institute: short(200),
      duration: short(60),
      year: short(20),
      description: long(1000),
    })
  ),
  projects: list(
    z.object({
      id,
      name: short(200),
      description: long(2000),
      url: short(300),
      technologies: list(z.string().max(80), 30),
    })
  ),
  skills: list(z.string().max(100), 100),
  languages: list(
    z.object({
      id,
      name: short(80),
      proficiency: z.enum(["native", "fluent", "intermediate", "basic"]).optional().default("intermediate"),
    }),
    20
  ),
  certifications: list(
    z.object({ id, name: short(200), issuer: short(200), date: short(40), credentialId: short(120), credentialUrl: short(300) })
  ),
  awards: list(z.object({ id, title: short(200), issuer: short(200), date: short(40), description: long(1000) })),
  publications: list(
    z.object({ id, title: short(300), publisher: short(200), date: short(40), url: short(300), description: long(1000) })
  ),
  volunteerExperience: list(
    z.object({
      id,
      organization: short(200),
      role: short(200),
      startDate: short(40),
      endDate: short(40),
      current: flag,
      description: long(1000),
    })
  ),
  references: list(
    z.object({
      id,
      name: short(120),
      position: short(200),
      company: short(200),
      email: short(200),
      phone: short(40),
      relationship: short(120),
    }),
    10
  ),
  interests: list(z.string().max(100), 50),
  courses: list(z.object({ id, name: short(200), provider: short(200), date: short(40), certificateUrl: short(300) })),
  memberships: list(
    z.object({
      id,
      organization: short(200),
      role: short(200),
      startDate: short(40),
      endDate: short(40),
      current: flag,
    })
  ),
  customSections: list(z.object({ title: short(120), content: long(5000) }), 20),
});

export type ResumeContentInput = z.infer<typeof resumeContentSchema>;

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const language = z.enum(["en", "bn"]);
const format = z.enum(["international", "bangladeshi", "ats"]);
const templateSlug = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Invalid template");

export const createResumeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  templateId: templateSlug.optional(),
  format: format.optional(),
  language: language.optional(),
});

export const updateResumeSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    templateId: templateSlug.optional(),
    format: format.optional(),
    content: resumeContentSchema.optional(),
    sectionOrder: z.array(z.string().max(40)).max(30).optional(),
    theme: z.record(z.string().max(500)).optional(),
    language: language.optional(),
  })
  .strict();

export const updateTemplateSchema = z.object({ templateId: templateSlug });

export const reorderSectionsSchema = z.object({ sectionOrder: z.array(z.string().max(40)).max(30) });

export const resumeIdParamSchema = z.object({ id: objectId });

export const generateResumeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(120),
  skills: z.string().max(2000).optional().default(""),
  experience: z.string().max(5000).optional().default(""),
  education: z.string().max(2000).optional().default(""),
  projects: z.string().max(3000).optional().default(""),
  language: language.optional().default("en"),
  resumeId: objectId.optional(),
});

export const tailorResumeSchema = z.object({
  resumeId: objectId.optional(),
  jobDescription: z.string().trim().min(20).max(12000),
  language: language.optional().default("en"),
  content: resumeContentSchema.partial().optional(),
});

export const improveResumeSchema = z.object({
  resumeText: z.string().min(50).max(20000),
  jobDescription: z.string().min(20).max(12000),
  language: language.optional().default("en"),
  resumeId: objectId.optional(),
});

export const atsCheckSchema = z.object({
  resumeText: z.string().min(50).max(20000),
  jobDescription: z.string().max(12000).optional(),
  language: language.optional(),
});
