import mongoose, { Document, Schema } from "mongoose";

export interface IBkashConfig extends Document {
  provider: "sslcommerz" | "bkash" | "nagad";
  number?: string;
  instructions?: string;
  enabled: boolean;
  isActive: boolean;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bkashConfigSchema = new Schema<IBkashConfig>(
  {
    provider: { type: String, enum: ["sslcommerz", "bkash", "nagad"], required: true, unique: true },
    number: { type: String, trim: true },
    instructions: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

bkashConfigSchema.pre("save", function (next) {
  this.isActive = this.enabled;
  next();
});

bkashConfigSchema.index({ provider: 1 });

export const BkashConfig = mongoose.model<IBkashConfig>("BkashConfig", bkashConfigSchema);
