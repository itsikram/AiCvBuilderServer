import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "user" | "admin";
export type SubscriptionPlan = "free" | "premium";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "trial";
export type Language = "en" | "bn";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  googleId?: string;
  role: UserRole;
  language: Language;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    expiresAt?: Date;
    stripeCustomerId?: string;
  };
  usage: {
    resumesCreated: number;
    aiRequestsThisMonth: number;
    lastAiReset: Date;
  };
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referralCount: number;
  theme: "light" | "dark" | "system";
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    avatar: String,
    googleId: { type: String, sparse: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    language: { type: String, enum: ["en", "bn"], default: "en" },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    subscription: {
      plan: { type: String, enum: ["free", "premium"], default: "free" },
      status: {
        type: String,
        enum: ["active", "cancelled", "expired", "trial"],
        default: "active",
      },
      expiresAt: Date,
    },
    usage: {
      resumesCreated: { type: Number, default: 0 },
      aiRequestsThisMonth: { type: Number, default: 0 },
      lastAiReset: { type: Date, default: Date.now },
    },
    referralCode: { type: String, unique: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    referralCount: { type: Number, default: 0 },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const bcrypt = await import("bcryptjs");
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(candidate, this.password);
};

userSchema.index({ email: 1 });
userSchema.index({ referralCode: 1 });

export const User = mongoose.model<IUser>("User", userSchema);
