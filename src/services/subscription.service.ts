import { prisma } from "../config/database.js";
import type { User } from "../models/User.js";
import { planLimitsOf } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/index.js";
import { getIntSetting } from "./settings.service.js";

export interface PlanLimits {
  maxResumes: number;
  maxAiRequests: number;
  /** AI requests per day (Bangladesh time); -1 = unlimited */
  dailyAiRequests: number;
  watermarkPdf: boolean;
  premiumTemplates: boolean;
  atsChecker: boolean;
  coverLetters: boolean;
  aiOptimization: boolean;
}

type FeatureFlag = "watermarkPdf" | "premiumTemplates" | "atsChecker" | "coverLetters" | "aiOptimization";

const FREE_LIMITS = {
  maxResumes: 2,
  maxAiRequests: 5,
  watermarkPdf: true,
  premiumTemplates: false,
  atsChecker: false,
  coverLetters: false,
  aiOptimization: false,
};

const PREMIUM_LIMITS = {
  maxResumes: -1,
  maxAiRequests: 100,
  watermarkPdf: false,
  premiumTemplates: true,
  atsChecker: true,
  coverLetters: true,
  aiOptimization: true,
};

const isPremium = (user: User) => user.subscriptionPlan === "premium" && user.subscriptionStatus === "active";

/**
 * Effective limits for a user. Base values come from the plan documents (Admin ->
 * Plans), falling back to built-in defaults. The MAX_* and AI_DAILY_QUOTA_* keys in
 * Admin -> Settings override them when set; AI_DAILY_QUOTA_* default to env values.
 */
export const getUserLimits = async (user: User): Promise<PlanLimits> => {
  const premium = isPremium(user);
  const tier = premium ? "PREMIUM" : "FREE";
  const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: premium ? "premium" : "free" } });
  const base = { ...(premium ? PREMIUM_LIMITS : FREE_LIMITS), ...(plan ? planLimitsOf(plan) : {}) };

  return {
    ...base,
    maxResumes: await getIntSetting(`MAX_RESUMES_${tier}`, base.maxResumes),
    maxAiRequests: await getIntSetting(`MAX_AI_REQUESTS_${tier}`, base.maxAiRequests),
    dailyAiRequests: await getIntSetting(
      `AI_DAILY_QUOTA_${tier}`,
      premium ? config.ai.dailyQuotaPremium : config.ai.dailyQuotaFree
    ),
  };
};

/** Calendar day in Bangladesh (UTC+6, no DST), e.g. "2026-10-21". Daily quotas reset at local midnight. */
export const bdDayKey = (date = new Date()) => new Date(date.getTime() + 6 * 3600_000).toISOString().slice(0, 10);

const nextBdMidnight = (date = new Date()) => {
  const shifted = new Date(date.getTime() + 6 * 3600_000);
  shifted.setUTCHours(24, 0, 0, 0);
  return new Date(shifted.getTime() - 6 * 3600_000);
};

/** Resets the monthly and daily counters when their period has rolled over. */
const rollOverUsage = async (user: User) => {
  const now = new Date();
  const lastReset = new Date(user.lastAiReset);
  const changes: Partial<Pick<User, "aiRequestsThisMonth" | "lastAiReset" | "aiDayKey" | "aiRequestsToday">> = {};
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    changes.aiRequestsThisMonth = 0;
    changes.lastAiReset = now;
  }
  const today = bdDayKey(now);
  if (user.aiDayKey !== today) {
    changes.aiDayKey = today;
    changes.aiRequestsToday = 0;
  }
  if (Object.keys(changes).length) {
    await prisma.user.update({ where: { id: user.id }, data: changes });
    Object.assign(user, changes);
  }
};

export const checkResumeLimit = async (user: User, currentCount: number): Promise<void> => {
  const limits = await getUserLimits(user);
  if (limits.maxResumes !== -1 && currentCount >= limits.maxResumes) {
    throw new ApiError(
      403,
      `Your plan allows ${limits.maxResumes} CVs. Delete one or upgrade to Premium for unlimited CVs.`
    );
  }
};

export const checkAiLimit = async (user: User): Promise<void> => {
  const limits = await getUserLimits(user);
  await rollOverUsage(user);

  if (limits.maxAiRequests !== -1 && user.aiRequestsThisMonth >= limits.maxAiRequests) {
    throw new ApiError(403, "Monthly AI request limit reached. Upgrade to Premium for more.");
  }
  if (limits.dailyAiRequests !== -1 && (user.aiRequestsToday ?? 0) >= limits.dailyAiRequests) {
    throw new ApiError(
      429,
      `You've used today's ${limits.dailyAiRequests} AI requests. The limit resets at midnight (Bangladesh time).`
    );
  }
};

/** Counts one AI request. Atomic, so parallel requests can't undercount. */
export const incrementAiUsage = async (user: User): Promise<void> => {
  const today = bdDayKey();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { aiRequestsThisMonth: { increment: 1 }, aiRequestsToday: { increment: 1 }, aiDayKey: today },
    select: { aiRequestsThisMonth: true, aiRequestsToday: true, aiDayKey: true },
  });
  // Keep the caller's copy in step
  Object.assign(user, updated);
};

export interface AiQuota {
  dailyLimit: number;
  usedToday: number;
  monthlyLimit: number;
  usedThisMonth: number;
  resetsAt: string;
  /** Exported PDFs carry the site watermark (free plan by default) */
  watermarkPdf: boolean;
}

export const getAiQuota = async (user: User): Promise<AiQuota> => {
  const limits = await getUserLimits(user);
  await rollOverUsage(user);
  return {
    dailyLimit: limits.dailyAiRequests,
    usedToday: user.aiRequestsToday ?? 0,
    monthlyLimit: limits.maxAiRequests,
    usedThisMonth: user.aiRequestsThisMonth,
    resetsAt: nextBdMidnight().toISOString(),
    watermarkPdf: limits.watermarkPdf,
  };
};

export const checkFeatureAccess = async (user: User, feature: FeatureFlag): Promise<void> => {
  const limits = await getUserLimits(user);
  if (!limits[feature]) {
    throw new ApiError(403, `This feature requires a Premium subscription.`);
  }
};

export const activatePremium = async (
  user: User,
  billingCycle: "monthly" | "yearly"
): Promise<void> => {
  const expiresAt = new Date();
  if (billingCycle === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }
  const data = { subscriptionPlan: "premium", subscriptionStatus: "active", subscriptionExpiresAt: expiresAt } as const;
  await prisma.user.update({ where: { id: user.id }, data });
  Object.assign(user, data);
};
