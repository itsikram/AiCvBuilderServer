import type { Prisma, Resume } from "../generated/prisma/client.js";

export type { Resume };

export interface IExperience {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  bullets: string[];
}

export interface IEducation {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
  /** ssc | hsc | diploma | honours | bachelor | masters | phd | other */
  level?: string;
  /** Education board (SSC/HSC) or university */
  board?: string;
  /** "5.00" (SSC/HSC GPA) or "4.00" (CGPA) */
  gpaScale?: string;
  passingYear?: string;
}

export interface ITraining {
  id: string;
  title: string;
  institute: string;
  duration?: string;
  year?: string;
  description?: string;
}

/** Optional Bangladeshi CV personal details */
export interface IPersonalDetails {
  fatherName?: string;
  motherName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  maritalStatus?: string;
  nid?: string;
  bloodGroup?: string;
  permanentAddress?: string;
}

export interface IProject {
  id: string;
  name: string;
  description: string;
  url?: string;
  technologies: string[];
}

export interface ILanguage {
  id: string;
  name: string;
  proficiency: "native" | "fluent" | "intermediate" | "basic";
}

export interface ICertification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface IAward {
  id: string;
  title: string;
  issuer: string;
  date: string;
  description?: string;
}

export interface IPublication {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url?: string;
  description?: string;
}

export interface IVolunteerExperience {
  id: string;
  organization: string;
  role: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
}

export interface IReference {
  id: string;
  name: string;
  position: string;
  company: string;
  email?: string;
  phone?: string;
  relationship: string;
}

export interface ICourse {
  id: string;
  name: string;
  provider: string;
  date: string;
  certificateUrl?: string;
}

export interface IMembership {
  id: string;
  organization: string;
  role?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
}

export interface IResumeContent {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    portfolio?: string;
    github?: string;
    website?: string;
    summary: string;
    jobTitle?: string;
    profilePhoto?: string;
    profilePhotoSize?: "small" | "medium" | "large";
    profilePhotoAlignment?: "left" | "center" | "right";
  };
  careerObjective?: string;
  personalDetails?: IPersonalDetails;
  experience: IExperience[];
  education: IEducation[];
  trainings?: ITraining[];
  projects: IProject[];
  skills: string[];
  languages: ILanguage[];
  certifications: ICertification[];
  awards: IAward[];
  publications: IPublication[];
  volunteerExperience: IVolunteerExperience[];
  references: IReference[];
  interests: string[];
  courses: ICourse[];
  memberships: IMembership[];
  customSections: { title: string; content: string }[];
}

/**
 * Section ids in display order, in the order a Bangladeshi CV usually follows. The
 * client renders sections missing from a CV's sectionOrder after the listed ones.
 */
export const DEFAULT_SECTION_ORDER = [
  "objective",
  "summary",
  "experience",
  "education",
  "training",
  "skills",
  "projects",
  "certifications",
  "languages",
  "awards",
  "publications",
  "volunteer",
  "courses",
  "memberships",
  "interests",
  "custom",
  "personalDetails",
  "references",
];

/** Theme for CVs created without a template theme (e.g. imported CVs) */
export const DEFAULT_THEME: Record<string, string> = {
  accentColor: "#2563eb",
  headingColor: "#111827",
  textColor: "#111827",
  backgroundColor: "#ffffff",
  fontFamily: "Inter",
  nameFontSize: "24",
  headingFontSize: "12",
  bodyFontSize: "10",
  sectionSpacing: "medium",
  gradientStart: "",
  gradientEnd: "",
  gradientDirection: "to-right",
  backgroundImage: "",
  backgroundOpacity: "10",
};

const LIST_SECTIONS = [
  "experience",
  "education",
  "trainings",
  "projects",
  "skills",
  "languages",
  "certifications",
  "awards",
  "publications",
  "volunteerExperience",
  "references",
  "interests",
  "courses",
  "memberships",
  "customSections",
] as const;

/**
 * Fills the defaults every stored CV has (empty lists, personal info strings, photo
 * layout), so readers never meet a missing section. Applied before each write.
 */
export const withContentDefaults = (content: Partial<IResumeContent> | undefined): IResumeContent => {
  const source = (content ?? {}) as Partial<IResumeContent>;
  const info: Partial<IResumeContent["personalInfo"]> = source.personalInfo ?? {};
  const filled = {
    ...source,
    personalInfo: {
      ...info,
      fullName: info.fullName ?? "",
      email: info.email ?? "",
      phone: info.phone ?? "",
      location: info.location ?? "",
      summary: info.summary ?? "",
      profilePhotoSize: info.profilePhotoSize ?? "medium",
      profilePhotoAlignment: info.profilePhotoAlignment ?? "center",
    },
    careerObjective: source.careerObjective ?? "",
  } as IResumeContent;
  for (const key of LIST_SECTIONS) {
    if (!Array.isArray(filled[key])) (filled as unknown as Record<string, unknown[]>)[key] = [];
  }
  return filled;
};

/** Json column value for Prisma writes */
export const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** A CV for API responses, in the shape the client has always received */
export const serializeResume = (resume: Resume) => ({
  _id: resume.id,
  ...resume,
  content: resume.content as unknown as IResumeContent,
  theme: (resume.theme ?? {}) as Record<string, string>,
  sectionOrder: (resume.sectionOrder ?? []) as string[],
  atsFeedback: (resume.atsFeedback ?? []) as string[],
});
