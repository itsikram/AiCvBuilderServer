import rateLimit from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "./auth.middleware.js";

// Limits are kept in process memory, which suits single-process shared hosting.
// Behind a proxy, `trust proxy` (set in index.ts) makes req.ip the real client IP.

const message = (text: string) => ({ success: false, message: text });

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many requests, please try again in a few minutes."),
});

/** Login, register, password reset and verification: per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many attempts. Please wait 15 minutes and try again."),
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many session refreshes. Please log in again."),
});

/** AI endpoints: per signed-in user (falls back to IP), on top of the daily quota. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthRequest).user?.userId ?? req.ip ?? "unknown",
  message: message("You're using AI features very quickly. Please wait a little and try again."),
});
