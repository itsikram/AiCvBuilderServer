import mongoose, { Document, Schema } from "mongoose";

export interface IPageContent extends Document {
  pageId: string;
  language: "en" | "bn";
  content: Record<string, unknown>;
  isActive: boolean;
  updatedAt: Date;
  createdAt: Date;
}

const PageContentSchema = new Schema<IPageContent>(
  {
    pageId: {
      type: String,
      required: true,
      enum: ["home", "about", "contact"],
    },
    language: {
      type: String,
      required: true,
      enum: ["en", "bn"],
      default: "en",
    },
    content: {
      type: Object,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure unique combination of pageId and language
PageContentSchema.index({ pageId: 1, language: 1 }, { unique: true });

export const PageContent = mongoose.models.PageContent || mongoose.model<IPageContent>("PageContent", PageContentSchema);