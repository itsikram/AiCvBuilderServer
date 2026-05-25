import mongoose, { Document, Schema } from "mongoose";

export interface IAnalytics extends Document {
  date: Date;
  metrics: {
    newUsers: number;
    activeUsers: number;
    resumesCreated: number;
    resumesUploaded: number;
    aiRequests: number;
    pdfExports: number;
    revenue: number;
    premiumConversions: number;
  };
}

const analyticsSchema = new Schema<IAnalytics>(
  {
    date: { type: Date, required: true, unique: true },
    metrics: {
      newUsers: { type: Number, default: 0 },
      activeUsers: { type: Number, default: 0 },
      resumesCreated: { type: Number, default: 0 },
      resumesUploaded: { type: Number, default: 0 },
      aiRequests: { type: Number, default: 0 },
      pdfExports: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      premiumConversions: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Analytics = mongoose.model<IAnalytics>("Analytics", analyticsSchema);
