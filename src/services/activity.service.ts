import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/database.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { getIntSetting } from "./settings.service.js";

// The user activity log behind Admin -> Activity. Writes never block or fail the request
// that caused them: they run in the background and only log a warning if they fail.

/** Every kind of activity, with the label Admin -> Activity shows for it. */
export const ACTIVITY_TYPES = {
  "user.registered": "Signed up",
  "user.login": "Logged in",
  "user.email_verified": "Verified email",
  "user.password_reset": "Reset password",
  "cv.created": "Created a CV",
  "cv.deleted": "Deleted a CV",
  "cv.shared": "Changed CV sharing",
  "cv.exported": "Downloaded a CV",
  "cover_letter.created": "Created a cover letter",
  "ai.used": "Used an AI tool",
  "payment.requested": "Asked to buy Premium",
  "payment.completed": "Payment completed",
  "payment.failed": "Payment failed or rejected",
  "plan.changed": "Plan changed by admin",
  "trial.started": "Started a free trial",
  "trial.ended": "Free trial ended",
} as const;

export type ActivityType = keyof typeof ACTIVITY_TYPES;

export const isActivityType = (value: unknown): value is ActivityType =>
  typeof value === "string" && Object.hasOwn(ACTIVITY_TYPES, value);

export interface ActivityInput {
  userId: string | null | undefined;
  type: ActivityType;
  /** One readable line, e.g. `Created CV "Software Engineer"` */
  message: string;
  metadata?: Record<string, unknown>;
  /** The user's request, for their IP address and browser (omit for server-side events) */
  req?: Request;
}

const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined);

/** Records one activity in the background; the caller never waits for it. */
export const recordActivity = (input: ActivityInput): void => {
  void prisma.activityLog
    .create({
      data: {
        userId: input.userId ?? null,
        type: input.type,
        message: input.message.slice(0, 500),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ip: clip(input.req?.ip, 64),
        userAgent: clip(input.req?.get("user-agent"), 255),
      },
    })
    .catch((error: Error) => console.warn(`Could not record activity ${input.type}: ${error.message}`));
};

/**
 * A payment's outcome, from the gateway's callback or an admin's review.
 * `outcome` finishes the sentence, e.g. "confirmed by SSLCommerz" or "rejected by an admin".
 */
export const recordPaymentOutcome = (
  payment: { id: string; userId: string | null; amount: number; currency: string; planSlug: string; billingCycle: string; provider: string; transactionId: string },
  completed: boolean,
  outcome: string,
  extra: Record<string, unknown> = {}
): void =>
  recordActivity({
    userId: payment.userId,
    type: completed ? "payment.completed" : "payment.failed",
    message: `Payment of ${payment.currency} ${payment.amount.toLocaleString("en-US")} for ${payment.planSlug} (${payment.billingCycle}) ${outcome}`,
    metadata: {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      provider: payment.provider,
      plan: payment.planSlug,
      billingCycle: payment.billingCycle,
      amount: payment.amount,
      currency: payment.currency,
      ...extra,
    },
  });

/** Names for the AI endpoints under /resumes/ai, keyed by path. */
const AI_FEATURES: Record<string, string> = {
  "/generate": "Generate CV content",
  "/tailor": "Tailor CV to a job",
  "/write-summary": "Write objective or summary",
  "/rewrite-bullets": "Polish job duties",
  "/suggest-skills": "Suggest skills",
  "/grammar": "Grammar check",
  "/improve": "Improve CV",
  "/ats-check": "ATS check",
  "/interview/questions": "Interview questions",
  "/interview/feedback": "Interview answer feedback",
  "/coach": "Career coach chat",
};

/**
 * Mounted on /resumes/ai (after authentication): logs each AI request that succeeded.
 * Failed and over-quota requests aren't logged, as they aren't counted against the quota either.
 */
export const recordAiUse = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.method === "POST") {
    const feature = AI_FEATURES[req.path] ?? req.path;
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.user) return;
      recordActivity({ userId: req.user.userId, type: "ai.used", message: `Used AI: ${feature}`, metadata: { feature }, req });
    });
  }
  next();
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes activity older than ACTIVITY_RETENTION_DAYS (0 or less keeps everything). */
export const pruneActivity = async (): Promise<number> => {
  const days = await getIntSetting("ACTIVITY_RETENTION_DAYS", 180);
  if (days <= 0) return 0;
  const { count } = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * DAY_MS) } } });
  return count;
};

/** Prunes now and then once a day, for as long as the process runs. */
export const scheduleActivityPruning = (): void => {
  const run = () =>
    pruneActivity()
      .then((count) => count && console.log(`Deleted ${count} activity entries past the retention period`))
      .catch((error: Error) => console.warn(`Activity pruning failed: ${error.message}`));
  void run();
  setInterval(run, DAY_MS).unref();
};
