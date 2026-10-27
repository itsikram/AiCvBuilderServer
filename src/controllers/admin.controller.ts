import { Response } from "express";
import { prisma } from "../config/database.js";
import type { Language, PageId, Prisma } from "../generated/prisma/client.js";
import { serializeUser, subscriptionOf } from "../models/User.js";
import { asJson } from "../models/Resume.js";
import {
  planLimitsData,
  serializeAdminSetting,
  serializeBlog,
  serializeCoupon,
  serializePageContent,
  serializePayment,
  serializePaymentConfig,
  serializePlan,
  serializeTemplate,
} from "../models/serializers.js";
import { invalidateSettings } from "../services/settings.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { getDashboardStats } from "../services/analytics.service.js";
import { geminiKeyManager } from "../services/ai/gemini-key-manager.js";
import { uploadBuffer } from "../services/cloudinary.service.js";
import { normalizeLanguage } from "../utils/language.js";
import { completePayment } from "../services/payment.service.js";
import { findActiveBkashConfig } from "./payment.controller.js";

const parseBlogTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const getOptionalString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const getBoolean = (value: unknown): boolean => value === true || value === "true";

const uploadBlogCoverImage = async (file?: Express.Multer.File) => {
  if (!file) return undefined;

  const uploaded = await uploadBuffer(file.buffer, "aicvbuilderbd/blogs", "image", {
    resource_type: "image",
    use_filename: true,
    unique_filename: true,
    filename_override: file.originalname,
  });

  if (!uploaded) {
    throw new ApiError(500, "Cloudinary is not configured");
  }

  return uploaded.url;
};

const buildBlogPayload = async (req: AuthRequest) => {
  const payload: Prisma.BlogUncheckedUpdateInput = {};

  const title = getOptionalString(req.body.title);
  if (title) payload.title = title;

  const slug = getOptionalString(req.body.slug);
  if (slug) payload.slug = slug;

  const excerpt = getOptionalString(req.body.excerpt);
  if (excerpt) payload.excerpt = excerpt;

  const content = getOptionalString(req.body.content);
  if (content) payload.content = content;

  const coverImage = await uploadBlogCoverImage(req.file);
  const fallbackCoverImage = getOptionalString(req.body.coverImage);
  if (coverImage || fallbackCoverImage) {
    payload.coverImage = coverImage || fallbackCoverImage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
    payload.tags = parseBlogTags(req.body.tags);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "language")) {
    const language = req.body.language;
    payload.language = language === "bn" ? "bn" : "en";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "isPublished")) {
    payload.isPublished = getBoolean(req.body.isPublished);
  }

  if (payload.isPublished === true && !Object.prototype.hasOwnProperty.call(req.body, "publishedAt")) {
    payload.publishedAt = new Date();
  } else if (getOptionalString(req.body.publishedAt)) {
    const publishedAt = new Date(req.body.publishedAt);
    if (!Number.isNaN(publishedAt.getTime())) payload.publishedAt = publishedAt;
  }

  const metaTitle = getOptionalString(req.body.metaTitle);
  if (metaTitle) payload.metaTitle = metaTitle;

  const metaDescription = getOptionalString(req.body.metaDescription);
  if (metaDescription) payload.metaDescription = metaDescription;

  return payload;
};

const payerSelect = { select: { id: true, name: true, email: true } } as const;

export const getDashboard = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [stats, totalUsers, totalResumes, totalRevenue, recentUsers] = await Promise.all([
    getDashboardStats(),
    prisma.user.count(),
    prisma.resume.count(),
    prisma.payment.aggregate({ where: { status: "completed" }, _sum: { amount: true } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  res.json({
    success: true,
    data: {
      stats,
      totalUsers,
      totalResumes,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      recentUsers: recentUsers.map((user) => ({
        _id: user.id,
        name: user.name,
        email: user.email,
        subscription: subscriptionOf(user),
        createdAt: user.createdAt,
      })),
    },
  });
});

export const getUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  // MySQL's default collation makes `contains` case-insensitive
  const where: Prisma.UserWhereInput = search
    ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ success: true, data: { users: users.map(serializeUser), total, page, pages: Math.ceil(total / limit) } });
});

const findUserOr404 = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Validated by adminUpdateUserSchema: name, role, language, theme, isEmailVerified
  const updateData = { ...req.body } as Prisma.UserUpdateInput;

  if (typeof updateData.language !== "undefined") {
    updateData.language = normalizeLanguage(updateData.language);
  }

  await findUserOr404(String(req.params.id));
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: updateData });
  res.json({ success: true, data: serializeUser(user) });
});

export const updateUserSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { plan, expiresAt } = req.body;

  await findUserOr404(String(req.params.id));
  if (plan && plan !== "free" && plan !== "premium") {
    throw new ApiError(400, "Plan must be free or premium");
  }
  const expiry = expiresAt ? new Date(expiresAt) : undefined;
  if (expiry && Number.isNaN(expiry.getTime())) {
    throw new ApiError(400, "Invalid expiry date");
  }

  const user = await prisma.user.update({
    where: { id: String(req.params.id) },
    data: {
      ...(plan && { subscriptionPlan: plan, subscriptionStatus: "active" }),
      ...(expiry && { subscriptionExpiresAt: expiry }),
    },
  });
  res.json({ success: true, data: serializeUser(user) });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Their CVs and cover letters go with them; payments and blog posts are kept
  await prisma.user.deleteMany({ where: { id: String(req.params.id) } });
  res.json({ success: true, message: "User deleted" });
});

export const getPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      include: { user: payerSelect },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count(),
  ]);
  res.json({ success: true, data: { payments: payments.map(serializePayment), total, page } });
});

export const getBkashConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: serializePaymentConfig(await findActiveBkashConfig()) });
});

export const updateBkashConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { number, instructions } = req.body as { number?: string; instructions?: string };

  if (!number || !String(number).trim()) {
    throw new ApiError(400, "BKash number is required");
  }

  const config = await prisma.$transaction(async (tx) => {
    await tx.paymentConfig.updateMany({ where: { provider: "bkash", isActive: true }, data: { isActive: false } });
    return tx.paymentConfig.create({
      data: {
        provider: "bkash",
        number: String(number).trim(),
        instructions: instructions ? String(instructions).trim() : "",
        updatedById: req.user!.userId,
        isActive: true,
      },
    });
  });

  res.json({ success: true, data: serializePaymentConfig(config) });
});

const PAYMENT_STATUSES: readonly string[] = ["pending", "completed", "failed", "cancelled", "refunded"];

export const getBkashPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (status !== "all" && !PAYMENT_STATUSES.includes(status)) {
    res.json({ success: true, data: { payments: [] } });
    return;
  }
  const payments = await prisma.payment.findMany({
    where: { provider: "bkash", ...(status !== "all" && { status: status as Prisma.PaymentWhereInput["status"] }) },
    include: { user: payerSelect },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: { payments: payments.map(serializePayment) } });
});

export const reviewBkashPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, reviewNotes } = req.body as {
    status?: "completed" | "failed";
    reviewNotes?: string;
  };

  if (!status || !["completed", "failed"].includes(status)) {
    throw new ApiError(400, "Status must be completed or failed");
  }

  const existing = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new ApiError(404, "Payment not found");

  const payment = await prisma.payment.update({
    where: { id: existing.id },
    data: {
      status,
      providerData: asJson({
        ...((existing.providerData as Record<string, unknown> | null) || {}),
        reviewNotes: reviewNotes || "",
        reviewedBy: req.user!.userId,
        reviewedAt: new Date().toISOString(),
      }),
    },
  });

  if (status === "completed") {
    await completePayment(payment);
  }

  res.json({ success: true, data: serializePayment(payment) });
});

/** Coupon columns from a validated create/update body (codes are stored upper-case) */
const couponData = (body: Record<string, unknown>) => {
  const { code, applicablePlans, ...rest } = body;
  return {
    ...rest,
    ...(typeof code === "string" && { code: code.toUpperCase() }),
    ...(applicablePlans !== undefined && { applicablePlans: asJson(applicablePlans) }),
  };
};

export const createCoupon = asyncHandler(async (req: AuthRequest, res: Response) => {
  const coupon = await prisma.coupon.create({
    data: { applicablePlans: [], ...couponData(req.body) } as Prisma.CouponCreateInput,
  });
  res.status(201).json({ success: true, data: serializeCoupon(coupon) });
});

export const getCoupons = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: coupons.map(serializeCoupon) });
});

export const updateCoupon = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.coupon.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new ApiError(404, "Coupon not found");
  const coupon = await prisma.coupon.update({
    where: { id: existing.id },
    data: couponData(req.body) as Prisma.CouponUpdateInput,
  });
  res.json({ success: true, data: serializeCoupon(coupon) });
});

/** Template columns from a validated create/update body */
const templateData = (body: Record<string, unknown>) => {
  const { defaultTheme, ...rest } = body;
  return { ...rest, ...(defaultTheme !== undefined && { defaultTheme: asJson(defaultTheme) }) };
};

export const manageTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.method === "GET" || !req.body) {
    const templates = await prisma.template.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ success: true, data: templates.map(serializeTemplate) });
    return;
  }
  const template = await prisma.template.create({
    data: { defaultTheme: {}, description: "", ...templateData(req.body) } as Prisma.TemplateCreateInput,
  });
  res.status(201).json({ success: true, data: serializeTemplate(template) });
});

export const updateTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.template.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new ApiError(404, "Template not found");
  const template = await prisma.template.update({
    where: { id: existing.id },
    data: templateData(req.body) as Prisma.TemplateUpdateInput,
  });
  res.json({ success: true, data: serializeTemplate(template) });
});

export const deleteTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { count } = await prisma.template.deleteMany({ where: { id: String(req.params.id) } });
  if (!count) throw new ApiError(404, "Template not found");
  res.json({ success: true, message: "Template deleted successfully" });
});

export const manageBlogs = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const blogs = await prisma.blog.findMany({
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, data: blogs.map(serializeBlog) });
});

export const createBlog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await buildBlogPayload(req);
  if (!payload.title || !payload.slug || !payload.excerpt || !payload.content) {
    throw new ApiError(400, "Title, slug, excerpt and content are required");
  }
  const blog = await prisma.blog.create({
    data: { tags: [], ...payload, authorId: req.user!.userId } as Prisma.BlogUncheckedCreateInput,
  });
  res.status(201).json({ success: true, data: serializeBlog(blog) });
});

export const updateBlog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await buildBlogPayload(req);
  const existing = await prisma.blog.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Blog not found");
  const blog = await prisma.blog.update({ where: { id: existing.id }, data: payload });
  res.json({ success: true, data: serializeBlog(blog) });
});

export const getGeminiKeyStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const keyStats = geminiKeyManager.getKeyStats();
  const availableKeys = geminiKeyManager.getAvailableKeyCount();

  res.json({
    success: true,
    data: {
      totalKeys: keyStats.length,
      availableKeys,
      keys: keyStats.map((stat, idx) => ({
        ...stat,
        masked: `key_${idx}_${stat.isLimited ? "limited" : "active"}`,
      })),
    },
  });
});

// Page Content Management (CMS)
const PAGE_IDS: readonly string[] = ["home", "about", "contact", "pricing", "blog"];
const LANGUAGES: readonly string[] = ["en", "bn"];

export const getPageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pageId, language = "en" } = req.query;

  // Unknown pages or languages match nothing
  if ((pageId && !PAGE_IDS.includes(String(pageId))) || (language && !LANGUAGES.includes(String(language)))) {
    res.json({ success: true, data: [] });
    return;
  }

  const contents = await prisma.pageContent.findMany({
    where: {
      isActive: true,
      ...(pageId ? { pageId: pageId as PageId } : {}),
      ...(language ? { language: language as Language } : {}),
    },
    orderBy: [{ pageId: "asc" }, { language: "asc" }],
  });

  res.json({
    success: true,
    data: contents.map(serializePageContent),
  });
});

export const createPageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pageId, language = "en", content } = req.body;

  if (!pageId || !content) {
    throw new ApiError(400, "Page ID and content are required");
  }
  if (!PAGE_IDS.includes(pageId) || !LANGUAGES.includes(language)) {
    throw new ApiError(400, "Unknown page or language");
  }

  // One row per page and language: saving again replaces the content
  const pageContent = await prisma.pageContent.upsert({
    where: { pageId_language: { pageId, language } },
    create: { pageId, language, content: asJson(content), isActive: true },
    update: { content: asJson(content), isActive: true },
  });

  res.status(201).json({
    success: true,
    data: serializePageContent(pageContent),
  });
});

export const updatePageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const { content, isActive } = req.body;

  const existing = await prisma.pageContent.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, "Page content not found");
  }

  const pageContent = await prisma.pageContent.update({
    where: { id },
    data: {
      ...(content !== undefined && { content: asJson(content) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
  });

  res.json({
    success: true,
    data: serializePageContent(pageContent),
  });
});

export const deletePageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);

  const { count } = await prisma.pageContent.deleteMany({ where: { id } });
  if (!count) {
    throw new ApiError(404, "Page content not found");
  }

  res.json({
    success: true,
    message: "Page content deleted",
  });
});

export const getAllPageContents = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const contents = await prisma.pageContent.findMany({ orderBy: [{ pageId: "asc" }, { language: "asc" }] });

  res.json({
    success: true,
    data: contents.map(serializePageContent),
  });
});

// Admin Settings Management (for env file values)
// Allowed settings keys that can be managed via admin panel
const ALLOWED_SETTINGS_KEYS = [
  'SITE_NAME',
  'SITE_TAGLINE',
  'SUPPORT_EMAIL',
  'CONTACT_EMAIL',
  'COMPANY_NAME',
  'COMPANY_ADDRESS',
  'COMPANY_PHONE',
  'DEFAULT_CURRENCY',
  'TAX_RATE',
  'REFERRAL_BONUS_AMOUNT',
  'MAX_RESUMES_FREE',
  'MAX_AI_REQUESTS_FREE',
  'MAX_RESUMES_PREMIUM',
  'MAX_AI_REQUESTS_PREMIUM',
  'AI_DAILY_QUOTA_FREE',
  'AI_DAILY_QUOTA_PREMIUM',
  'MAINTENANCE_MODE',
  'REGISTRATION_ENABLED',
  'GOOGLE_CLIENT_ID',
  'SSL_COMMERZ_STORE_ID',
  'SSL_COMMERZ_STORE_PASSWD',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM_EMAIL',
  'SMTP_FROM_NAME',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'NAGAD_MERCHANT_NUMBER',
  'NAGAD_MERCHANT_PASSWORD',
];

const SECRET_SETTING = /PASS|SECRET|PRIVATE|API_KEY/;

export const getAdminSettings = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await prisma.adminSetting.findMany({
    include: { updatedBy: { select: { name: true } } },
    orderBy: { key: "asc" },
  });

  // Build a map of all settings
  const settingsMap: Record<string, { value: string; updatedAt: Date; updatedBy?: string }> = {};

  for (const setting of settings) {
    settingsMap[setting.key] = {
      value: setting.value,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy?.name,
    };
  }

  // Include allowed keys even if not set. Env values are shown as the default, except
  // secrets, which never leave the server.
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (!settingsMap[key]) {
      settingsMap[key] = {
        value: SECRET_SETTING.test(key) ? '' : process.env[key] || '',
        updatedAt: new Date(),
      };
    }
  }

  res.json({
    success: true,
    data: settingsMap,
    allowedKeys: ALLOWED_SETTINGS_KEYS,
  });
});

export const updateAdminSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key, value } = req.body;

  if (!key || typeof key !== 'string') {
    throw new ApiError(400, 'Setting key is required');
  }

  if (!ALLOWED_SETTINGS_KEYS.includes(key)) {
    throw new ApiError(403, `Cannot modify setting: ${key}. Only admin-configurable settings are allowed.`);
  }

  const data = { value: value !== undefined ? String(value).trim() : '', updatedById: req.user!.userId };
  const setting = await prisma.adminSetting.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
  invalidateSettings();

  res.json({
    success: true,
    data: serializeAdminSetting(setting),
  });
});

export const deleteAdminSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = typeof req.params.key === 'string' ? req.params.key : '';

  if (!key || !ALLOWED_SETTINGS_KEYS.includes(key)) {
    throw new ApiError(403, `Cannot delete setting: ${key}`);
  }

  const { count } = await prisma.adminSetting.deleteMany({ where: { key } });
  invalidateSettings();

  if (!count) {
    throw new ApiError(404, 'Setting not found');
  }

  res.json({
    success: true,
    message: 'Setting deleted successfully',
  });
});

// Helper function to get config value with priority: env > admin settings
export const getConfigValue = (key: string, defaultValue?: string): string => {
  // First priority: environment variable
  const envValue = process.env[key];
  if (envValue !== undefined && envValue !== '') {
    return envValue;
  }

  // This will be populated at runtime by caching
  return defaultValue || '';
};

// Subscription Plan Management
export const getSubscriptionPlans = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } });
  res.json({
    success: true,
    data: plans.map(serializePlan),
  });
});

export const createSubscriptionPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    name,
    slug,
    description,
    priceMonthly,
    priceYearly,
    currency = "BDT",
    features = [],
    limits,
    isActive = true,
    sortOrder = 0,
  } = req.body;

  if (!name || !slug) {
    throw new ApiError(400, "Plan name and slug are required");
  }

  if (typeof priceMonthly !== "number" || typeof priceYearly !== "number") {
    throw new ApiError(400, "Monthly and yearly prices must be numbers");
  }

  // Check if slug already exists
  const existing = await prisma.subscriptionPlan.findUnique({ where: { slug } });
  if (existing) {
    throw new ApiError(400, "A plan with this slug already exists");
  }

  // Limits left out take the column defaults (the free plan's)
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      slug,
      description: description || "",
      priceMonthly,
      priceYearly,
      currency,
      features: asJson(Array.isArray(features) ? features : []),
      ...planLimitsData(limits),
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder) || 0,
    },
  });

  res.status(201).json({
    success: true,
    data: serializePlan(plan),
  });
});

export const updateSubscriptionPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const updateData = { ...req.body };

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  // Validate slug uniqueness if being updated
  if (updateData.slug && updateData.slug !== plan.slug) {
    const existing = await prisma.subscriptionPlan.findFirst({ where: { slug: updateData.slug, id: { not: id } } });
    if (existing) {
      throw new ApiError(400, "A plan with this slug already exists");
    }
  }

  // Update allowed fields
  const data: Prisma.SubscriptionPlanUpdateInput = {};
  if (updateData.name !== undefined) data.name = updateData.name;
  if (updateData.slug !== undefined) data.slug = updateData.slug;
  if (updateData.description !== undefined) data.description = updateData.description;
  if (updateData.priceMonthly !== undefined) data.priceMonthly = Number(updateData.priceMonthly);
  if (updateData.priceYearly !== undefined) data.priceYearly = Number(updateData.priceYearly);
  if (updateData.currency !== undefined) data.currency = updateData.currency;
  if (updateData.features !== undefined) data.features = asJson(updateData.features);
  if (updateData.limits !== undefined) Object.assign(data, planLimitsData(updateData.limits));
  if (updateData.isActive !== undefined) data.isActive = Boolean(updateData.isActive);
  if (updateData.sortOrder !== undefined) data.sortOrder = Number(updateData.sortOrder) || 0;

  const updated = await prisma.subscriptionPlan.update({ where: { id }, data });

  res.json({
    success: true,
    data: serializePlan(updated),
  });
});

export const deleteSubscriptionPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);

  const { count } = await prisma.subscriptionPlan.deleteMany({ where: { id } });
  if (!count) {
    throw new ApiError(404, "Subscription plan not found");
  }

  res.json({
    success: true,
    message: "Subscription plan deleted successfully",
  });
});
