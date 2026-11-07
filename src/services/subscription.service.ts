import { prisma } from "../config/database.js";
import { subscriptionOf, trialEnded, type User } from "../models/User.js";
import { planLimitsOf } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/index.js";
import { getBoolSetting, getIntSetting } from "./settings.service.js";
import { recordActivity } from "./activity.service.js";
import { bdDate, notifyUser } from "./notification.service.js";
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

/** Extra AI requests from a pack that are still usable. */
export const bonusAiAvailable = (user: User, now = new Date()) =>
  user.bonusAiRequests > 0 && (!user.bonusAiExpiresAt || user.bonusAiExpiresAt.getTime() > now.getTime())
    ? user.bonusAiRequests
    : 0;

/** True when the plan's monthly or daily AI limit is used up (pack credits then pay for requests). */
const overPlanLimits = (user: User, limits: PlanLimits) =>
  (limits.maxAiRequests !== -1 && user.aiRequestsThisMonth >= limits.maxAiRequests) ||
  (limits.dailyAiRequests !== -1 && (user.aiRequestsToday ?? 0) >= limits.dailyAiRequests);

export const checkAiLimit = async (user: User): Promise<void> => {
  const limits = await getUserLimits(user);
  await rollOverUsage(user);
  // Requests from an AI pack are used only after the plan's own limits
  if (bonusAiAvailable(user) > 0) return;

  if (limits.maxAiRequests !== -1 && user.aiRequestsThisMonth >= limits.maxAiRequests) {
    throw new ApiError(403, "Monthly AI request limit reached. Upgrade to Premium or buy an AI pack for more.");
  }
  if (limits.dailyAiRequests !== -1 && (user.aiRequestsToday ?? 0) >= limits.dailyAiRequests) {
    throw new ApiError(
      429,
      `You've used today's ${limits.dailyAiRequests} AI requests. The limit resets at midnight (Bangladesh time), or buy an AI pack for more.`
    );
  }
};

/**
 * Counts one AI request. Atomic, so parallel requests can't undercount. A request beyond the
 * plan's limits (allowed by checkAiLimit because of an AI pack) uses one pack credit instead.
 */
export const incrementAiUsage = async (user: User): Promise<void> => {
  const limits = await getUserLimits(user);
  const paidByPack = overPlanLimits(user, limits) && bonusAiAvailable(user) > 0;
  const today = bdDayKey();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      aiRequestsThisMonth: { increment: 1 },
      aiRequestsToday: { increment: 1 },
      aiDayKey: today,
      ...(paidByPack && { bonusAiRequests: { decrement: 1 } }),
    },
    select: { aiRequestsThisMonth: true, aiRequestsToday: true, aiDayKey: true, bonusAiRequests: true },
  });
  // Keep the caller's copy in step
  Object.assign(user, updated, { bonusAiRequests: Math.max(0, updated.bonusAiRequests) });
};

export interface AiQuota {
  dailyLimit: number;
  usedToday: number;
  monthlyLimit: number;
  usedThisMonth: number;
  resetsAt: string;
  /** Exported PDFs carry the site watermark (free plan by default) */
  watermarkPdf: boolean;
  /** Extra requests from an AI pack, used after the limits above */
  bonusRequests: number;
  bonusExpiresAt?: string;
  /** Watermark-free PDF downloads bought one at a time */
  pdfCredits: number;
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
    bonusRequests: bonusAiAvailable(user),
    bonusExpiresAt: bonusAiAvailable(user) ? user.bonusAiExpiresAt?.toISOString() : undefined,
    pdfCredits: user.pdfCredits,
  };
};

export const checkFeatureAccess = async (user: User, feature: FeatureFlag): Promise<void> => {
  const limits = await getUserLimits(user);
  if (!limits[feature]) {
    throw new ApiError(403, `This feature requires a Premium subscription.`);
  }
};

/** Days of Premium each pass gives: 7-day, 30-day and 1-year (Admin -> Plans sets the prices). */
export const PASS_DAYS = { weekly: 7, monthly: 30, yearly: 365 } as const;
export type PassCycle = keyof typeof PASS_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Adds Premium days, from a pass, an access code or a referral reward. Days stack: they start
 * when the current Premium (or trial) ends, or now. Premium without an end date stays as it is.
 */
export const grantPremiumDays = async (user: User, days: number): Promise<void> => {
  const current = subscriptionOf(user);
  const premiumNow = current.plan === "premium" && (current.status === "active" || current.status === "trial");
  if (premiumNow && current.status === "active" && !user.subscriptionExpiresAt) return;
  const start = premiumNow && user.subscriptionExpiresAt ? Math.max(Date.now(), user.subscriptionExpiresAt.getTime()) : Date.now();
  const data = {
    subscriptionPlan: "premium",
    subscriptionStatus: "active",
    subscriptionExpiresAt: new Date(start + days * DAY_MS),
    // A new period gets its own "ends soon" reminder
    expiryReminderSentAt: null,
  } as const;
  await prisma.user.update({ where: { id: user.id }, data });
  Object.assign(user, data);
};

/** Gives what a completed Premium payment bought. */
export const activatePremium = async (user: User, billingCycle: PassCycle): Promise<void> => {
  await grantPremiumDays(user, PASS_DAYS[billingCycle]);
};

// ---------------------------------------------------------------------------------------------
// Free Premium trial: one per account, as long as the Premium plan's trialDays (Admin -> Plans).
// While it runs the user is on Premium with status "trial"; when subscriptionExpiresAt passes,
// isPremium() is false at once and endExpiredPremium() moves the row back to the Free plan.
// ---------------------------------------------------------------------------------------------

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
 * Moves Premium past its end date (passes, codes, rewards and trials) back to the Free plan,
 * logs it and emails the user. Access already stopped at the end date (isPremium); this keeps
 * the stored plan, admin lists and stats right.
 */
export const endExpiredPremium = async (): Promise<number> => {
  const ended = await prisma.user.findMany({
    where: {
      subscriptionPlan: "premium",
      subscriptionStatus: { in: ["trial", "active"] },
      subscriptionExpiresAt: { lte: new Date() },
    },
    select: { id: true, name: true, email: true, subscriptionStatus: true },
    take: 1000,
  });
  if (!ended.length) return 0;
  await prisma.user.updateMany({
    where: { id: { in: ended.map((user) => user.id) }, subscriptionExpiresAt: { lte: new Date() } },
    data: { subscriptionPlan: "free", subscriptionStatus: "active", subscriptionExpiresAt: null, expiryReminderSentAt: null },
  });
  for (const user of ended) {
    const trial = user.subscriptionStatus === "trial";
    recordActivity({
      userId: user.id,
      type: trial ? "trial.ended" : "plan.ended",
      message: trial ? "Free Premium trial ended; back on the Free plan" : "Premium ended; back on the Free plan",
    });
    notifyUser(user, {
      subject: trial ? "Your free Premium trial has ended" : "Your Premium has ended",
      heading: trial ? "Your free trial has ended" : "Your Premium has ended",
      paragraphs: [
        "You're back on the Free plan. Your CVs are safe, and you can keep editing them and downloading PDFs.",
        "Want unlimited CVs, every template and watermark-free PDFs again? A 7-day pass is the cheapest way back.",
      ],
      link: { label: "Get Premium again", path: "/dashboard/billing" },
    });
  }
  return ended.length;
};

/** Emails users whose Premium (or trial) ends within 3 days, once per period. */
export const sendExpiryReminders = async (): Promise<number> => {
  const now = new Date();
  const soon = await prisma.user.findMany({
    where: {
      subscriptionPlan: "premium",
      subscriptionStatus: { in: ["trial", "active"] },
      subscriptionExpiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) },
      expiryReminderSentAt: null,
    },
    select: { id: true, name: true, email: true, subscriptionStatus: true, subscriptionExpiresAt: true },
    take: 500,
  });
  for (const user of soon) {
    // Claim the reminder first, so two servers (or runs) never send it twice
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, expiryReminderSentAt: null },
      data: { expiryReminderSentAt: now },
    });
    if (!count) continue;
    const trial = user.subscriptionStatus === "trial";
    const date = bdDate(user.subscriptionExpiresAt!);
    notifyUser(user, {
      subject: trial ? `Your free trial ends on ${date}` : `Your Premium ends on ${date}`,
      heading: trial ? "Your free trial ends soon" : "Your Premium ends soon",
      paragraphs: [
        `${trial ? "Your free Premium trial" : "Your Premium"} ends on ${date}. After that you go back to the Free plan; your CVs stay safe.`,
        "To keep unlimited CVs, every template and watermark-free PDFs, buy a pass before then. New days are added after your current end date, so you lose nothing by renewing early.",
      ],
      link: { label: "Keep Premium", path: "/dashboard/billing" },
    });
  }
  return soon.length;
};

/** Ends expired Premium and sends "ends soon" reminders, now and every hour. */
export const scheduleSubscriptionJobs = (): void => {
  const run = async () => {
    try {
      const ended = await endExpiredPremium();
      if (ended) console.log(`Ended ${ended} expired Premium subscription(s) or trial(s)`);
      const reminded = await sendExpiryReminders();
      if (reminded) console.log(`Sent ${reminded} Premium expiry reminder(s)`);
    } catch (error) {
      console.warn(`Subscription jobs failed: ${(error as Error).message}`);
    }
  };
  void run();
  setInterval(run, 60 * 60 * 1000).unref();
};
