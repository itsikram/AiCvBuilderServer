import mongoose, { Document, Schema } from "mongoose";

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
    profilePhoto?: string;
    profilePhotoSize?: "small" | "medium" | "large";
    profilePhotoAlignment?: "left" | "center" | "right";
  };
  experience: IExperience[];
  education: IEducation[];
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

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  templateId: string;
  format: "international" | "bangladeshi" | "ats";
  content: IResumeContent;
  atsScore?: number;
  atsFeedback?: string[];
  isPublic: boolean;
  publicSlug?: string;
  language: "en" | "bn";
  theme: Record<string, string>;
  sectionOrder: string[];
  lastExportedAt?: Date;
  viewCount: number;
  uploadedResumeText?: string;
  uploadedFileName?: string;
  uploadedFilePath?: string;
  uploadedFileUrl?: string;
  uploadedFileMimeType?: string;
  uploadedFileSize?: number;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true },
    templateId: { type: String, default: "modern-ats" },
    format: {
      type: String,
      enum: ["international", "bangladeshi", "ats"],
      default: "ats",
    },
    content: {
      personalInfo: {
        fullName: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },
        location: { type: String, default: "" },
        linkedin: String,
        portfolio: String,
        github: String,
        website: String,
        summary: { type: String, default: "" },
        profilePhoto: String,
        profilePhotoSize: { type: String, enum: ["small", "medium", "large"], default: "medium" },
        profilePhotoAlignment: { type: String, enum: ["left", "center", "right"], default: "center" },
      },
      experience: [
        {
          id: String,
          company: String,
          position: String,
          location: String,
          startDate: String,
          endDate: String,
          current: Boolean,
          bullets: [String],
        },
      ],
      education: [
        {
          id: String,
          institution: String,
          degree: String,
          field: String,
          startDate: String,
          endDate: String,
          gpa: String,
        },
      ],
      projects: [
        {
          id: String,
          name: String,
          description: String,
          url: String,
          technologies: [String],
        },
      ],
      skills: [String],
      languages: [
        {
          id: String,
          name: String,
          proficiency: { type: String, enum: ["native", "fluent", "intermediate", "basic"] },
        },
      ],
      certifications: [
        {
          id: String,
          name: String,
          issuer: String,
          date: String,
          credentialId: String,
          credentialUrl: String,
        },
      ],
      awards: [
        {
          id: String,
          title: String,
          issuer: String,
          date: String,
          description: String,
        },
      ],
      publications: [
        {
          id: String,
          title: String,
          publisher: String,
          date: String,
          url: String,
          description: String,
        },
      ],
      volunteerExperience: [
        {
          id: String,
          organization: String,
          role: String,
          startDate: String,
          endDate: String,
          current: Boolean,
          description: String,
        },
      ],
      references: [
        {
          id: String,
          name: String,
          position: String,
          company: String,
          email: String,
          phone: String,
          relationship: String,
        },
      ],
      interests: [String],
      courses: [
        {
          id: String,
          name: String,
          provider: String,
          date: String,
          certificateUrl: String,
        },
      ],
      memberships: [
        {
          id: String,
          organization: String,
          role: String,
          startDate: String,
          endDate: String,
          current: Boolean,
        },
      ],
      customSections: [{ title: String, content: String }],
    },
    atsScore: Number,
    atsFeedback: [String],
    isPublic: { type: Boolean, default: false },
    publicSlug: { type: String, sparse: true, unique: true },
    language: { type: String, enum: ["en", "bn"], default: "en" },
    theme: { type: Map, of: String, default: {} },
    sectionOrder: {
      type: [String],
      default: ["summary", "experience", "education", "skills", "projects"],
    },
    lastExportedAt: Date,
    viewCount: { type: Number, default: 0 },
    uploadedResumeText: { type: String, default: null },
    uploadedFileName: { type: String, default: null },
    uploadedFilePath: { type: String, default: null },
    uploadedFileUrl: { type: String, default: null },
    uploadedFileMimeType: { type: String, default: null },
    uploadedFileSize: { type: Number, default: null },
    uploadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

resumeSchema.index({ userId: 1, createdAt: -1 });
resumeSchema.index({ publicSlug: 1 });

export const Resume = mongoose.model<IResume>("Resume", resumeSchema);
