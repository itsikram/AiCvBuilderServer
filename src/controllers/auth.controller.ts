import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { Response } from "express";
import { prisma } from "../config/database.js";
import { User, comparePassword, hashPassword, serializeUser, subscriptionOf, usageOf } from "../models/User.js";
import { config } from "../config/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { generateAccessToken, generateRefreshToken } from "../utils/tokens.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service.js";
import { trackEvent } from "../services/analytics.service.js";
import { uploadBuffer } from "../services/cloudinary.service.js";
import { normalizeLanguage } from "../utils/language.js";

const googleClient = config.google.clientId
  ? new OAuth2Client(config.google.clientId)
  : null;

// clearCookie only matches when these options equal the ones the cookie was set with
const refreshCookieOptions = {
  httpOnly: true,
  secure: config.env === "production" || config.cookieSameSite === "none",
  sameSite: config.cookieSameSite,
  domain: config.cookieDomain,
};

const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

// Only verified emails qualify, so nobody can claim admin by registering the address first.
const promoteAutoAdmin = async (user: User) => {
  if (user.role === "admin" || !user.isEmailVerified) return user;
  if (!config.autoAdminEmails.includes(user.email.toLowerCase())) return user;
  return prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
};

const sendTokens = async (res: Response, current: User) => {
  const user = await promoteAutoAdmin(current);
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  res.cookie("refreshToken", refreshToken, {
    ...refreshCookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: normalizeLanguage(user.language),
        theme: user.theme,
        avatar: user.avatar ?? undefined,
        isEmailVerified: user.isEmailVerified,
        subscription: subscriptionOf(user),
        referralCode: user.referralCode,
      },
      accessToken,
    },
  });
};

const uploadProfilePicture = async (file?: Express.Multer.File) => {
  if (!file) return undefined;

  const uploaded = await uploadBuffer(file.buffer, "aicvbuilderbd/profile-pictures", "image", {
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  });

  if (!uploaded) {
    throw new ApiError(500, "Profile picture upload failed");
  }

  return uploaded.url;
};

const newReferralCode = () => `CV${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, password, referralCode, language } = req.body;
  const email = normalizeEmail(req.body.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "Email already registered");

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const avatar = await uploadProfilePicture(req.file);

  let referredById: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: String(referralCode).toUpperCase() } });
    if (referrer) {
      referredById = referrer.id;
      await prisma.user.update({ where: { id: referrer.id }, data: { referralCount: { increment: 1 } } });
    }
  }

  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email,
      password: await hashPassword(password),
      avatar,
      language: normalizeLanguage(language || "en"),
      referralCode: newReferralCode(),
      referredById,
      emailVerificationToken: crypto.createHash("sha256").update(verificationToken).digest("hex"),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // The account already exists, so a failed email must not turn sign-up into an error
  await sendVerificationEmail(email, name, verificationToken).catch(() => undefined);
  await trackEvent("newUsers");

  await sendTokens(res, user);
});

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { password } = req.body;
  const found = await prisma.user.findUnique({ where: { email: normalizeEmail(req.body.email) } });
  if (!found || !(await comparePassword(found, password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const user = await prisma.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
  await trackEvent("activeUsers");

  await sendTokens(res, user);
});

export const googleLogin = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!googleClient) throw new ApiError(503, "Google login not configured");

  const { credential } = req.body;
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new ApiError(400, "Invalid Google token");
  const email = normalizeEmail(payload.email);

  let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name || email.split("@")[0],
        email,
        googleId: payload.sub,
        avatar: payload.picture,
        isEmailVerified: payload.email_verified ?? true,
        referralCode: newReferralCode(),
        lastLoginAt: new Date(),
      },
    });
    await trackEvent("newUsers");
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(!user.googleId && { googleId: payload.sub, isEmailVerified: true }),
      },
    });
  }

  await sendTokens(res, user);
});

export const refreshToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, "Refresh token required");

  const { verifyRefreshToken } = await import("../utils/tokens.js");
  const payload = verifyRefreshToken(token);
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new ApiError(401, "User not found");

  await sendTokens(res, user);
});

export const logout = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.clearCookie("refreshToken", refreshCookieOptions);
  res.json({ success: true, message: "Logged out" });
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new ApiError(404, "User not found");
  res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar ?? undefined,
      role: user.role,
      language: normalizeLanguage(user.language),
      theme: user.theme,
      isEmailVerified: user.isEmailVerified,
      subscription: subscriptionOf(user),
      usage: usageOf(user),
      referralCode: user.referralCode,
      referralCount: user.referralCount,
    },
  });
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: hashed, emailVerificationExpires: { gt: new Date() } },
  });
  if (!user) throw new ApiError(400, "Invalid or expired verification token");

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
  });

  res.json({ success: true, message: "Email verified successfully" });
});

export const forgotPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.json({ success: true, message: "If email exists, reset link sent" });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: crypto.createHash("sha256").update(resetToken).digest("hex"),
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  try {
    await sendPasswordResetEmail(email, user.name, resetToken);
  } catch {
    throw new ApiError(503, "We couldn't send the reset email right now. Please try again later.");
  }

  res.json({ success: true, message: "If email exists, reset link sent" });
});

export const resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token, password } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: hashed, passwordResetExpires: { gt: new Date() } },
  });
  if (!user) throw new ApiError(400, "Invalid or expired reset token");

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(password), passwordResetToken: null, passwordResetExpires: null },
  });

  res.json({ success: true, message: "Password reset successful" });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, theme } = req.body;
  const language = typeof req.body.language !== "undefined" ? normalizeLanguage(req.body.language) : undefined;
  const avatar = await uploadProfilePicture(req.file);

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      ...(name && { name }),
      ...(language !== undefined && { language }),
      ...(theme && { theme }),
      ...(avatar ? { avatar } : {}),
    },
  });

  res.json({ success: true, data: serializeUser(user) });
});
