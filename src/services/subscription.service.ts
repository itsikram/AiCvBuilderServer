import { IUser } from "../models/User.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { ApiError } from "../utils/ApiError.js";

const FREE_LIMITS = {
  maxResumes: 2,
  maxAiRequests: 5,
  watermarkPdf: true,
  premiumTemplates: false,
  atsChecker: false,
  coverLetters: false,
  aiOptimization: false,
};

export const getUserLimits = async (user: IUser) => {
  if (user.subscription.plan === "premium" && user.subscription.status === "active") {
    const premiumPlan = await SubscriptionPlan.findOne({ slug: "premium" });
    return premiumPlan?.limits || {
      maxResumes: -1,
      maxAiRequests: 100,
      watermarkPdf: false,
      premiumTemplates: true,
      atsChecker: true,
      coverLetters: true,
      aiOptimization: true,
    };
  }
  return FREE_LIMITS;
};

export const checkResumeLimit = async (user: IUser, currentCount: number): Promise<void> => {
  const limits = await getUserLimits(user);
  if (limits.maxResumes !== -1 && currentCount >= limits.maxResumes) {
    throw new ApiError(
      403,
      `Free plan allows ${limits.maxResumes} resumes. Upgrade to Premium for unlimited resumes.`
    );
  }
};

export const checkAiLimit = async (user: IUser): Promise<void> => {
  const limits = await getUserLimits(user);
  const now = new Date();
  const lastReset = new Date(user.usage.lastAiReset);

  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    user.usage.aiRequestsThisMonth = 0;
    user.usage.lastAiReset = now;
    await user.save();
  }

  if (user.usage.aiRequestsThisMonth >= limits.maxAiRequests) {
    throw new ApiError(403, "Monthly AI request limit reached. Upgrade to Premium for more.");
  }
};

export const incrementAiUsage = async (user: IUser): Promise<void> => {
  user.usage.aiRequestsThisMonth += 1;
  await user.save();
};

export const checkFeatureAccess = async (
  user: IUser,
  feature: keyof typeof FREE_LIMITS
): Promise<void> => {
  const limits = await getUserLimits(user);
  if (!limits[feature]) {
    throw new ApiError(403, `This feature requires a Premium subscription.`);
  }
};

export const activatePremium = async (
  user: IUser,
  billingCycle: "monthly" | "yearly"
): Promise<void> => {
  const expiresAt = new Date();
  if (billingCycle === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }
  user.subscription.plan = "premium";
  user.subscription.status = "active";
  user.subscription.expiresAt = expiresAt;
  await user.save();
};
