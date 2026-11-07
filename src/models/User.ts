import bcrypt from "bcryptjs";
import type { User } from "../generated/prisma/client.js";

export type { User };
export type UserRole = User["role"];
export type Language = User["language"];

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export const comparePassword = async (user: Pick<User, "password">, candidate: string): Promise<boolean> => {
  if (!user.password) return false;
  return bcrypt.compare(candidate, user.password);
};

/** The subscription fields in the nested shape the API has always returned */
export const subscriptionOf = (user: User) =>
  premiumEnded(user)
    ? // The stored row is switched to Free by endExpiredPremium() within the hour; until then, report it already
      { plan: "free" as const, status: "active" as const, expiresAt: undefined }
    : {
        plan: user.subscriptionPlan,
        status: user.subscriptionStatus,
        expiresAt: user.subscriptionExpiresAt ?? undefined,
      };

type SubscriptionFields = Pick<User, "subscriptionPlan" | "subscriptionStatus" | "subscriptionExpiresAt">;

/** A free trial whose end date has passed (a trial without an end date counts as ended). */
export const trialEnded = (user: Pick<User, "subscriptionStatus" | "subscriptionExpiresAt">, now = new Date()) =>
  user.subscriptionStatus === "trial" && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() <= now.getTime());

/**
 * Premium (paid, a pass, a code, a referral reward or a trial) whose end date has passed. Its
 * access stops at that moment. Paid Premium without an end date, as an admin can grant, never ends.
 */
export const premiumEnded = (user: SubscriptionFields, now = new Date()) =>
  trialEnded(user, now) ||
  (user.subscriptionPlan === "premium" &&
    user.subscriptionStatus === "active" &&
    Boolean(user.subscriptionExpiresAt) &&
    user.subscriptionExpiresAt!.getTime() <= now.getTime());

export const usageOf = (user: User) => ({
  resumesCreated: user.resumesCreated,
  aiRequestsThisMonth: user.aiRequestsThisMonth,
  lastAiReset: user.lastAiReset,
  aiRequestsToday: user.aiRequestsToday,
  aiDayKey: user.aiDayKey ?? undefined,
});

/** A user for API responses: never includes the password hash or one-time token hashes. */
export const serializeUser = (user: User) => {
  const {
    password: _password,
    emailVerificationToken: _verificationToken,
    emailVerificationExpires: _verificationExpires,
    passwordResetToken: _resetToken,
    passwordResetExpires: _resetExpires,
    subscriptionPlan: _plan,
    subscriptionStatus: _status,
    subscriptionExpiresAt: _expiresAt,
    resumesCreated: _resumesCreated,
    aiRequestsThisMonth: _aiMonth,
    lastAiReset: _lastAiReset,
    aiRequestsToday: _aiToday,
    aiDayKey: _aiDayKey,
    referredById,
    ...rest
  } = user;
  return {
    _id: user.id,
    ...rest,
    subscription: subscriptionOf(user),
    usage: usageOf(user),
    referredBy: referredById ?? undefined,
  };
};
