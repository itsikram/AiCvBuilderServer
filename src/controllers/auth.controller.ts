import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { Response } from "express";
import { User } from "../models/User.js";
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

const sendTokens = (res: Response, user: InstanceType<typeof User>) => {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: normalizeLanguage(user.language),
        theme: user.theme,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        subscription: user.subscription,
        referralCode: user.referralCode,
      },
      accessToken,
    },
  });
};

const uploadProfilePicture = async (file?: Express.Multer.File) => {
  if (!file) return undefined;

  const uploaded = await uploadBuffer(file.buffer, "chakricv/profile-pictures", "image", {
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  });

  if (!uploaded) {
    throw new ApiError(500, "Profile picture upload failed");
  }

  return uploaded.url;
};

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, email, password, referralCode, language } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "Email already registered");

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const userReferralCode = `CV${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const avatar = await uploadProfilePicture(req.file);

  let referredBy;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (referrer) {
      referredBy = referrer._id;
      referrer.referralCount += 1;
      await referrer.save();
    }
  }

  const user = await User.create({
    name,
    email,
    password,
    avatar,
    language: language || "en",
    referralCode: userReferralCode,
    referredBy,
    emailVerificationToken: crypto.createHash("sha256").update(verificationToken).digest("hex"),
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await sendVerificationEmail(email, name, verificationToken);
  await trackEvent("newUsers");

  sendTokens(res, user);
});

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  user.lastLoginAt = new Date();
  await user.save();
  await trackEvent("activeUsers");

  sendTokens(res, user);
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

  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });

  if (!user) {
    const referralCode = `CV${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    user = await User.create({
      name: payload.name || payload.email.split("@")[0],
      email: payload.email,
      googleId: payload.sub,
      avatar: payload.picture,
      isEmailVerified: payload.email_verified ?? true,
      referralCode,
    });
    await trackEvent("newUsers");
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    user.isEmailVerified = true;
    await user.save();
  }

  user.lastLoginAt = new Date();
  await user.save();
  sendTokens(res, user);
});

export const refreshToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, "Refresh token required");

  const { verifyRefreshToken } = await import("../utils/tokens.js");
  const payload = verifyRefreshToken(token);
  const user = await User.findById(payload.userId);
  if (!user) throw new ApiError(401, "User not found");

  sendTokens(res, user);
});

export const logout = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.clearCookie("refreshToken");
  res.json({ success: true, message: "Logged out" });
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");
  res.json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      language: normalizeLanguage(user.language),
      theme: user.theme,
      isEmailVerified: user.isEmailVerified,
      subscription: user.subscription,
      usage: user.usage,
      referralCode: user.referralCode,
      referralCount: user.referralCount,
    },
  });
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, "Invalid or expired verification token");

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.json({ success: true, message: "Email verified successfully" });
});

export const forgotPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.json({ success: true, message: "If email exists, reset link sent" });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  await sendPasswordResetEmail(email, user.name, resetToken);

  res.json({ success: true, message: "If email exists, reset link sent" });
});

export const resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token, password } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select("+password");
  if (!user) throw new ApiError(400, "Invalid or expired reset token");

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ success: true, message: "Password reset successful" });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, theme } = req.body;
  const language = typeof req.body.language !== "undefined" ? normalizeLanguage(req.body.language) : undefined;
  const avatar = await uploadProfilePicture(req.file);

  const user = await User.findByIdAndUpdate(
    req.user!.userId,
    {
      ...(name && { name }),
      ...(language !== undefined && { language }),
      ...(theme && { theme }),
      ...(avatar ? { avatar } : {}),
    },
    { new: true, runValidators: true }
  );

  res.json({ success: true, data: user });
});
