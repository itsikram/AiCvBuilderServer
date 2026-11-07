import crypto from "node:crypto";
import type { Request } from "express";
import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { recordActivity } from "./activity.service.js";
import { notifyUser } from "./notification.service.js";
import { getIntSetting } from "./settings.service.js";
import { grantPremiumDays } from "./subscription.service.js";

// ---------------------------------------------------------------------------------------------
// Referral rewards: a referred friend counts once they create their first CV (signing up alone
// is too easy to fake). Every REFERRAL_REWARD_EVERY such friends earn the referrer
// REFERRAL_REWARD_DAYS of Premium (Admin -> Settings -> User limits; 0 turns rewards off).
// ---------------------------------------------------------------------------------------------

export const referralRewardRule = async () => ({
  every: Math.max(0, await getIntSetting("REFERRAL_REWARD_EVERY", 3)),
  days: Math.max(0, await getIntSetting("REFERRAL_REWARD_DAYS", 7)),
});

/** Call after a user creates a CV; counts them for their referrer the first time. Never throws. */
export const qualifyReferral = (userId: string): void => {
  const run = async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { referredById: true, referralQualifiedAt: true, name: true } });
    if (!user?.referredById || user.referralQualifiedAt) return;
    // One-time switch, even if two CVs are created at once
    const { count } = await prisma.user.updateMany({ where: { id: userId, referralQualifiedAt: null }, data: { referralQualifiedAt: new Date() } });
    if (!count) return;
    const referrer = await prisma.user.update({ where: { id: user.referredById }, data: { qualifiedReferrals: { increment: 1 } } });
    recordActivity({
      userId: referrer.id,
      type: "referral.qualified",
      message: `A friend they invited (${user.name}) created a CV (${referrer.qualifiedReferrals} so far)`,
      metadata: { friendId: userId, qualifiedReferrals: referrer.qualifiedReferrals },
    });
    const { every, days } = await referralRewardRule();
    if (!every || !days || referrer.qualifiedReferrals % every !== 0) return;
    await grantPremiumDays(referrer, days);
    recordActivity({
      userId: referrer.id,
      type: "referral.rewarded",
      message: `Earned ${days} days of Premium for inviting ${every} friends`,
      metadata: { days, qualifiedReferrals: referrer.qualifiedReferrals },
    });
    notifyUser(referrer, {
      subject: `You earned ${days} days of Premium`,
      heading: "Thanks for inviting your friends!",
      paragraphs: [
        `${every} friends you invited have made their CVs, so we've added ${days} days of Premium to your account.`,
        "Keep sharing your invite link: every few friends who make a CV earn you more Premium days.",
      ],
      link: { label: "See your account", path: "/dashboard" },
    });
  };
  void run().catch((error: Error) => console.warn(`Referral reward failed: ${error.message}`));
};

// ---------------------------------------------------------------------------------------------
// Access codes for organisations (Admin -> Access codes): each account can redeem a code once
// for its premiumDays of Premium, up to maxUses accounts in total, until expiresAt.
// ---------------------------------------------------------------------------------------------

/** Normalises what a user typed: case and spaces don't matter. */
export const normalizeCode = (code: unknown) => String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** A readable random code such as "UNI-7K3Q9X" (no 0/O or 1/I to mistype). */
export const generateAccessCode = (prefix = "CV") => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${normalizeCode(prefix).replace(/[^A-Z0-9]/g, "").slice(0, 10) || "CV"}-${body}`;
};

export const redeemAccessCode = async (user: User, rawCode: unknown, req?: Request) => {
  const code = normalizeCode(rawCode);
  if (!code) throw new ApiError(400, "Enter a code.");
  const found = await prisma.accessCode.findUnique({ where: { code } });
  if (!found || !found.isActive) throw new ApiError(404, "That code isn't valid. Check it and try again.");
  if (found.expiresAt && found.expiresAt.getTime() < Date.now()) throw new ApiError(410, "That code has expired.");

  try {
    await prisma.$transaction(async (tx) => {
      // Counts the use only while uses are left; the unique (code, user) row stops repeats
      const { count } = await tx.accessCode.updateMany({
        where: { id: found.id, usedCount: { lt: found.maxUses } },
        data: { usedCount: { increment: 1 } },
      });
      if (!count) throw new ApiError(410, "That code has been used up.");
      await tx.accessCodeRedemption.create({ data: { codeId: found.id, userId: user.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "You've already used this code.");
    }
    throw error;
  }

  await grantPremiumDays(user, found.premiumDays);
  recordActivity({
    userId: user.id,
    type: "code.redeemed",
    message: `Redeemed code ${found.code} (${found.label}) for ${found.premiumDays} days of Premium`,
    metadata: { code: found.code, label: found.label, days: found.premiumDays },
    req,
  });
  return { days: found.premiumDays, label: found.label };
};
