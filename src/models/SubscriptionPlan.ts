import mongoose, { Document, Schema } from "mongoose";

export interface ISubscriptionPlan extends Document {
  name: string;
  slug: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  limits: {
    maxResumes: number;
    maxAiRequests: number;
    watermarkPdf: boolean;
    premiumTemplates: boolean;
    atsChecker: boolean;
    coverLetters: boolean;
    aiOptimization: boolean;
  };
  isActive: boolean;
  sortOrder: number;
}

const planSchema = new Schema<ISubscriptionPlan>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    priceMonthly: { type: Number, required: true },
    priceYearly: { type: Number, required: true },
    currency: { type: String, default: "BDT" },
    features: [String],
    limits: {
      maxResumes: { type: Number, default: 2 },
      maxAiRequests: { type: Number, default: 5 },
      watermarkPdf: { type: Boolean, default: true },
      premiumTemplates: { type: Boolean, default: false },
      atsChecker: { type: Boolean, default: false },
      coverLetters: { type: Boolean, default: false },
      aiOptimization: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  "SubscriptionPlan",
  planSchema
);
