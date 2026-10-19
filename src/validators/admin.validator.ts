import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id") });

/** Admins can change these user fields; passwords and usage counters are not editable here. */
export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    role: z.enum(["user", "admin"]).optional(),
    language: z.enum(["en", "bn"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    isEmailVerified: z.boolean().optional(),
  })
  .strict();

const couponFields = {
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.coerce.number().positive().max(100000),
  maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date(),
  applicablePlans: z.array(z.string().max(40)).max(20).optional(),
  isActive: z.boolean().optional(),
};

export const createCouponSchema = z
  .object(couponFields)
  .refine((c) => c.discountType !== "percentage" || c.discountValue <= 100, {
    message: "Percentage discount cannot exceed 100",
    path: ["discountValue"],
  });

export const updateCouponSchema = z.object(couponFields).partial().strict();

const templateFields = {
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and - only"),
  description: z.string().max(500).optional(),
  category: z.enum(["ats", "modern", "bangladeshi", "creative"]).optional(),
  thumbnail: z.string().max(500).optional(),
  isPremium: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultTheme: z.record(z.string().max(500)).optional(),
  layout: z.string().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
};

export const createTemplateSchema = z.object(templateFields);
export const updateTemplateSchema = z.object(templateFields).partial().strict();
