import mongoose, { Document, Schema } from "mongoose";

export interface ICoverLetter extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  companyName: string;
  jobTitle: string;
  content: string;
  language: "en" | "bn";
  resumeId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const coverLetterSchema = new Schema<ICoverLetter>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    companyName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    content: { type: String, required: true },
    language: { type: String, enum: ["en", "bn"], default: "en" },
    resumeId: { type: Schema.Types.ObjectId, ref: "Resume" },
  },
  { timestamps: true }
);

export const CoverLetter = mongoose.model<ICoverLetter>("CoverLetter", coverLetterSchema);
