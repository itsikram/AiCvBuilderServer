import mongoose, { Document, Schema } from "mongoose";

export type PaymentProvider = "sslcommerz" | "bkash" | "nagad";
export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled" | "refunded";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  planSlug: string;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  transactionId: string;
  providerSessionId?: string;
  providerData?: Record<string, unknown>;
  couponCode?: string;
  discountAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planSlug: { type: String, required: true },
    billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "BDT" },
    provider: { type: String, enum: ["sslcommerz", "bkash", "nagad"], required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled", "refunded"],
      default: "pending",
    },
    transactionId: { type: String, required: true, unique: true },
    providerSessionId: String,
    providerData: Schema.Types.Mixed,
    couponCode: String,
    discountAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
