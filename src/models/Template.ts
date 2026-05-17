import mongoose, { Document, Schema } from "mongoose";

export interface ITemplate extends Document {
  name: string;
  slug: string;
  description: string;
  category: "ats" | "modern" | "bangladeshi" | "creative";
  thumbnail: string;
  isPremium: boolean;
  isActive: boolean;
  defaultTheme: Record<string, string>;
  layout: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: ["ats", "modern", "bangladeshi", "creative"],
      default: "ats",
    },
    thumbnail: { type: String, default: "" },
    isPremium: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    defaultTheme: { type: Map, of: String, default: {} },
    layout: { type: String, default: "single-column" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Template = mongoose.model<ITemplate>("Template", templateSchema);
