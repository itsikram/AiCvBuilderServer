import mongoose, { Document, Schema } from "mongoose";

export interface IBlog extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  author: mongoose.Types.ObjectId;
  tags: string[];
  language: "en" | "bn";
  isPublished: boolean;
  publishedAt?: Date;
  metaTitle?: string;
  metaDescription?: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new Schema<IBlog>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    coverImage: String,
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tags: [String],
    language: { type: String, enum: ["en", "bn"], default: "en" },
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    metaTitle: String,
    metaDescription: String,
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

blogSchema.index({ slug: 1, language: 1 });
blogSchema.index({ isPublished: 1, publishedAt: -1 });

export const Blog = mongoose.model<IBlog>("Blog", blogSchema);
