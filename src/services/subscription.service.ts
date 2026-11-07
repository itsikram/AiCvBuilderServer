import { prisma } from "../config/database.js";
import { subscriptionOf, trialEnded, type User } from "../models/User.js";
import { planLimitsOf } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/index.js";
import { getBoolSetting, getIntSetting } from "./settings.service.js";
import { recordActivity } from "./activity.service.js";
import { BUILT_IN_PLAN_LIMITS } from "./planDefaults.js";

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

/** Paid Premium, or a free trial that hasn't ended (subscriptionOf() reports an ended trial as Free). */
export const isPremium = (user: User) => {
  const { plan, status } = subscriptionOf(user);
  return plan === "premium" && (status === "active" || status === "trial");
};

/**
 * Effective limits for a user. Base values come from the plan documents (Admin ->
 * Plans), falling back to built-in defaults. The MAX_* and AI_DAILY_QUOTA_* keys in
 * Admin -> Settings override them when set; AI_DAILY_QUOTA_* default to env values.
 */
export const getUserLimits = async (user: User): Promise<PlanLimits> => {
  const premium = isPremium(user);
  const tier = premium ? "PREMIUM" : "FREE";
  const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: premium ? "premium" : "free" } });
  const base = { ...BUILT_IN_PLAN_LIMITS[premium ? "premium" : "free"], ...(plan ? planLimitsOf(plan) : {}) };

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

// ---------------------------------------------------------------------------------------------
// Free Premium trial: one per account, as long as the Premium plan's trialDays (Admin -> Plans).
// While it runs the user is on Premium with status "trial"; when subscriptionExpiresAt passes,
// isPremium() is false at once and endExpiredTrials() moves the row back to the Free plan.
// ---------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of free trial on offer: the active Premium plan's trialDays, 0 when there is none. */
export const premiumTrialDays = async (): Promise<number> => {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: "premium" }, select: { trialDays: true, isActive: true } });
  return plan?.isActive ? Math.max(0, Math.floor(plan.trialDays)) : 0;
};

export type TrialUnavailable = "used" | "premium" | "unverified" | "none";

export interface TrialInfo {
  /** Trial length on offer, in days (0: no trial offered) */
  days: number;
  available: boolean;
  /** Why it can't be started, when it can't */
  reason?: TrialUnavailable;
  /** True while the user's trial is running */
  active: boolean;
  startedAt?: Date;
  /** When the running trial ends */
  endsAt?: Date;
}

const TRIAL_REFUSALS: Record<TrialUnavailable, [status: number, message: string]> = {
  used: [409, "You've already used your free trial. Upgrade to keep Premium features."],
  premium: [409, "You already have Premium."],
  unverified: [403, "Verify your email address first, then start your free trial."],
  none: [404, "There's no free trial on offer right now."],
};

/** Whether this user can start the free trial, and the state of theirs. */
export const getTrialInfo = async (user: User): Promise<TrialInfo> => {
  const days = await premiumTrialDays();
  const active = user.subscriptionStatus === "trial" && !trialEnded(user);
  const state = {
    days,
    active,
    startedAt: user.trialStartedAt ?? undefined,
    endsAt: active ? (user.subscriptionExpiresAt ?? undefined) : undefined,
  };
  const reason: TrialUnavailable | undefined = user.trialStartedAt
    ? "used"
    : isPremium(user)
      ? "premium"
      : !days
        ? "none"
        : !user.isEmailVerified && (await getBoolSetting("TRIAL_REQUIRES_VERIFIED_EMAIL", false))
          ? "unverified"
          : undefined;
  return reason ? { ...state, available: false, reason } : { ...state, available: true };
};

/** Starts the user's free Premium trial, or throws why they can't. */
export const startTrial = async (user: User): Promise<TrialInfo> => {
  const info = await getTrialInfo(user);
  if (info.reason) {
    const [status, message] = TRIAL_REFUSALS[info.reason];
    throw new ApiError(status, message);
  }
  const now = new Date();
  const data = {
    subscriptionPlan: "premium",
    subscriptionStatus: "trial",
    subscriptionExpiresAt: new Date(now.getTime() + info.days * DAY_MS),
    trialStartedAt: now,
  } as const;
  // `trialStartedAt: null` makes this a one-time switch even if two requests race
  const { count } = await prisma.user.updateMany({ where: { id: user.id, trialStartedAt: null }, data });
  if (!count) throw new ApiError(...TRIAL_REFUSALS.used);
  Object.assign(user, data);
  return getTrialInfo(user);
};

/**
 * Moves trials past their end date back to the Free plan and logs each one. Access already
 * stopped at the end date (isPremium); this keeps the stored plan, admin lists and stats right.
 */
export const endExpiredTrials = async (): Promise<number> => {
  const ended = await prisma.user.findMany({
    where: { subscriptionStatus: "trial", subscriptionExpiresAt: { lte: new Date() } },
    select: { id: true, trialStartedAt: true },
    take: 1000,
  });
  if (!ended.length) return 0;
  await prisma.user.updateMany({
    where: { id: { in: ended.map((user) => user.id) }, subscriptionStatus: "trial" },
    data: { subscriptionPlan: "free", subscriptionStatus: "active", subscriptionExpiresAt: null },
  });
  for (const user of ended) {
    recordActivity({ userId: user.id, type: "trial.ended", message: "Free Premium trial ended; back on the Free plan" });
  }
  return ended.length;
};

/** Runs endExpiredTrials() now and every hour. */
export const scheduleTrialExpiry = (): void => {
  const run = () =>
    endExpiredTrials()
      .then((count) => count && console.log(`Ended ${count} free trial(s)`))
      .catch((error: Error) => console.warn(`Ending free trials failed: ${error.message}`));
  void run();
  setInterval(run, 60 * 60 * 1000).unref();
};
