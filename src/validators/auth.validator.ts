import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, "Password must be at least 8 characters").max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
  referralCode: z.string().trim().max(40).optional(),
  language: z.enum(["en", "bn"]).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1).max(4096),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.enum(["en", "bn"]).optional(),
});
