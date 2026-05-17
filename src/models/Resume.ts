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

export interface IResumeContent {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    portfolio?: string;
    summary: string;
  };
  experience: IExperience[];
  education: IEducation[];
  projects: IProject[];
  skills: string[];
  languages: string[];
  certifications: string[];
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
        summary: { type: String, default: "" },
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
      languages: [String],
      certifications: [String],
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
  },
  { timestamps: true }
);

resumeSchema.index({ userId: 1, createdAt: -1 });
resumeSchema.index({ publicSlug: 1 });

export const Resume = mongoose.model<IResume>("Resume", resumeSchema);
