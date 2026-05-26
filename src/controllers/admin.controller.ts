import { Response } from "express";
import { User } from "../models/User.js";
import { Resume } from "../models/Resume.js";
import { Payment } from "../models/Payment.js";
import { Coupon } from "../models/Coupon.js";
import { Template } from "../models/Template.js";
import { Blog } from "../models/Blog.js";
import { PageContent } from "../models/PageContent.js";
import { BkashConfig } from "../models/BkashConfig.js";
import { AdminSetting } from "../models/AdminSetting.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { getDashboardStats } from "../services/analytics.service.js";
import { geminiKeyManager } from "../services/ai/gemini-key-manager.js";
import { uploadBuffer } from "../services/cloudinary.service.js";
import { normalizeLanguage } from "../utils/language.js";
import { activatePremium } from "../services/subscription.service.js";
import { Analytics } from "../models/Analytics.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";

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

  const uploaded = await uploadBuffer(file.buffer, "chakricv/blogs", "image", {
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
  const payload: Record<string, unknown> = {};

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
    payload.publishedAt = new Date().toISOString();
  }

  const metaTitle = getOptionalString(req.body.metaTitle);
  if (metaTitle) payload.metaTitle = metaTitle;

  const metaDescription = getOptionalString(req.body.metaDescription);
  if (metaDescription) payload.metaDescription = metaDescription;

  return payload;
};

export const getDashboard = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [stats, totalUsers, totalResumes, totalRevenue, recentUsers] = await Promise.all([
    getDashboardStats(),
    User.countDocuments(),
    Resume.countDocuments(),
    Payment.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    User.find().sort({ createdAt: -1 }).limit(10).select("name email subscription createdAt"),
  ]);

  res.json({
    success: true,
    data: {
      stats,
      totalUsers,
      totalResumes,
      totalRevenue: totalRevenue[0]?.total || 0,
      recentUsers,
    },
  });
});

export const getUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const search = (req.query.search as string) || "";

  const filter = search
    ? { $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-password"),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, data: { users, total, page, pages: Math.ceil(total / limit) } });
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const updateData = { ...req.body };

  if (typeof updateData.language !== "undefined") {
    updateData.language = normalizeLanguage(updateData.language);
  }

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) throw new ApiError(404, "User not found");
  res.json({ success: true, data: user });
});

export const updateUserSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { plan, expiresAt } = req.body;
  
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "User not found");

  if (plan) {
    user.subscription.plan = plan;
    user.subscription.status = "active";
  }
  
  if (expiresAt) {
    user.subscription.expiresAt = new Date(expiresAt);
  }

  await user.save();
  res.json({ success: true, data: user });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "User deleted" });
});

export const getPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const [payments, total] = await Promise.all([
    Payment.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Payment.countDocuments(),
  ]);
  res.json({ success: true, data: { payments, total, page } });
});

export const getBkashConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const config = await BkashConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
  res.json({ success: true, data: config });
});

export const updateBkashConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { number, instructions } = req.body as { number?: string; instructions?: string };

  if (!number || !String(number).trim()) {
    throw new ApiError(400, "BKash number is required");
  }

  await BkashConfig.updateMany({ isActive: true }, { $set: { isActive: false } });

  const config = await BkashConfig.create({
    number: String(number).trim(),
    instructions: instructions ? String(instructions).trim() : "",
    updatedBy: req.user!.userId,
    isActive: true,
  });

  res.json({ success: true, data: config });
});

export const getBkashPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  const filter = status === "all" ? { provider: "bkash" } : { provider: "bkash", status };
  const payments = await Payment.find(filter)
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: { payments } });
});

export const reviewBkashPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, reviewNotes } = req.body as {
    status?: "completed" | "failed";
    reviewNotes?: string;
  };

  if (!status || !["completed", "failed"].includes(status)) {
    throw new ApiError(400, "Status must be completed or failed");
  }

  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, "Payment not found");

  payment.status = status;
  payment.providerData = {
    ...(payment.providerData || {}),
    reviewNotes: reviewNotes || "",
    reviewedBy: req.user!.userId,
    reviewedAt: new Date().toISOString(),
  };

  await payment.save();

  if (status === "completed") {
    const user = await User.findById(payment.userId);
    if (user) {
      await activatePremium(user, payment.billingCycle);
    }

    if (payment.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: payment.couponCode },
        { $inc: { usedCount: 1 } }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await Analytics.findOneAndUpdate(
      { date: today },
      {
        $inc: {
          "metrics.revenue": payment.amount,
          "metrics.premiumConversions": 1,
        },
      },
      { upsert: true }
    );
  }

  res.json({ success: true, data: payment });
});

export const createCoupon = asyncHandler(async (req: AuthRequest, res: Response) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json({ success: true, data: coupon });
});

export const getCoupons = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json({ success: true, data: coupons });
});

export const updateCoupon = asyncHandler(async (req: AuthRequest, res: Response) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: coupon });
});

export const manageTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.method === "GET" || !req.body) {
    const templates = await Template.find().sort({ sortOrder: 1 });
    res.json({ success: true, data: templates });
    return;
  }
  const template = await Template.create(req.body);
  res.status(201).json({ success: true, data: template });
});

export const updateTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const template = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: template });
});

export const deleteTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const template = await Template.findByIdAndDelete(req.params.id);
  if (!template) throw new ApiError(404, "Template not found");
  res.json({ success: true, message: "Template deleted successfully" });
});

export const manageBlogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const blogs = await Blog.find().populate("author", "name").sort({ createdAt: -1 });
  res.json({ success: true, data: blogs });
});

export const createBlog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await buildBlogPayload(req);
  const blog = await Blog.create({ ...payload, author: req.user!.userId });
  res.status(201).json({ success: true, data: blog });
});

export const updateBlog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await buildBlogPayload(req);
  const blog = await Blog.findByIdAndUpdate(req.params.id, payload, { new: true });
  res.json({ success: true, data: blog });
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
export const getPageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pageId, language = "en" } = req.query;

  const filter: Record<string, unknown> = { isActive: true };
  if (pageId) filter.pageId = pageId;
  if (language) filter.language = language;

  const contents = await PageContent.find(filter).sort({ pageId: 1, language: 1 });

  res.json({
    success: true,
    data: contents,
  });
});

export const createPageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pageId, language = "en", content } = req.body;

  if (!pageId || !content) {
    throw new ApiError(400, "Page ID and content are required");
  }

  // Check if content already exists for this page and language
  const existing = await PageContent.findOne({ pageId, language });

  let pageContent;
  if (existing) {
    // Update existing
    existing.content = content;
    existing.isActive = true;
    await existing.save();
    pageContent = existing;
  } else {
    // Create new
    pageContent = await PageContent.create({
      pageId,
      language,
      content,
      isActive: true,
    });
  }

  res.status(201).json({
    success: true,
    data: pageContent,
  });
});

export const updatePageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content, isActive } = req.body;

  const pageContent = await PageContent.findById(id);
  if (!pageContent) {
    throw new ApiError(404, "Page content not found");
  }

  if (content !== undefined) pageContent.content = content;
  if (isActive !== undefined) pageContent.isActive = isActive;

  await pageContent.save();

  res.json({
    success: true,
    data: pageContent,
  });
});

export const deletePageContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const pageContent = await PageContent.findByIdAndDelete(id);
  if (!pageContent) {
    throw new ApiError(404, "Page content not found");
  }

  res.json({
    success: true,
    message: "Page content deleted",
  });
});

export const getAllPageContents = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const contents = await PageContent.find().sort({ pageId: 1, language: 1 });

  res.json({
    success: true,
    data: contents,
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

export const getAdminSettings = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await AdminSetting.find().sort({ key: 1 });
  
  // Build a map of all settings
  const settingsMap: Record<string, { value: string; updatedAt: Date; updatedBy?: string }> = {};
  
  for (const setting of settings) {
    let updatedByName: string | undefined;
    if (setting.updatedBy) {
      const updater = await User.findById(setting.updatedBy).select('name');
      updatedByName = updater?.name;
    }
    
    settingsMap[setting.key] = {
      value: setting.value,
      updatedAt: setting.updatedAt,
      updatedBy: updatedByName,
    };
  }
  
  // Include allowed keys even if not set (with empty values)
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (!settingsMap[key]) {
      settingsMap[key] = {
        value: process.env[key] || '',
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
  
  const setting = await AdminSetting.findOneAndUpdate(
    { key },
    { 
      key, 
      value: value !== undefined ? String(value) : '',
      updatedBy: req.user!.userId 
    },
    { new: true, upsert: true, runValidators: true }
  );
  
  res.json({
    success: true,
    data: setting,
  });
});

export const deleteAdminSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = typeof req.params.key === 'string' ? req.params.key : '';
  
  if (!key || !ALLOWED_SETTINGS_KEYS.includes(key)) {
    throw new ApiError(403, `Cannot delete setting: ${key}`);
  }
  
  const setting = await AdminSetting.findOneAndDelete({ key });
  
  if (!setting) {
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
  const plans = await SubscriptionPlan.find().sort({ sortOrder: 1 });
  res.json({
    success: true,
    data: plans,
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
  const existing = await SubscriptionPlan.findOne({ slug });
  if (existing) {
    throw new ApiError(400, "A plan with this slug already exists");
  }

  const plan = await SubscriptionPlan.create({
    name,
    slug,
    description: description || "",
    priceMonthly,
    priceYearly,
    currency,
    features: Array.isArray(features) ? features : [],
    limits: limits || {
      maxResumes: 2,
      maxAiRequests: 5,
      watermarkPdf: true,
      premiumTemplates: false,
      atsChecker: false,
      coverLetters: false,
      aiOptimization: false,
    },
    isActive,
    sortOrder,
  });

  res.status(201).json({
    success: true,
    data: plan,
  });
});

export const updateSubscriptionPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  const plan = await SubscriptionPlan.findById(id);
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  // Validate slug uniqueness if being updated
  if (updateData.slug && updateData.slug !== plan.slug) {
    const existing = await SubscriptionPlan.findOne({ slug: updateData.slug, _id: { $ne: id } });
    if (existing) {
      throw new ApiError(400, "A plan with this slug already exists");
    }
  }

  // Update allowed fields
  if (updateData.name !== undefined) plan.name = updateData.name;
  if (updateData.slug !== undefined) plan.slug = updateData.slug;
  if (updateData.description !== undefined) plan.description = updateData.description;
  if (updateData.priceMonthly !== undefined) plan.priceMonthly = updateData.priceMonthly;
  if (updateData.priceYearly !== undefined) plan.priceYearly = updateData.priceYearly;
  if (updateData.currency !== undefined) plan.currency = updateData.currency;
  if (updateData.features !== undefined) plan.features = updateData.features;
  if (updateData.limits !== undefined) plan.limits = updateData.limits;
  if (updateData.isActive !== undefined) plan.isActive = updateData.isActive;
  if (updateData.sortOrder !== undefined) plan.sortOrder = updateData.sortOrder;

  await plan.save();

  res.json({
    success: true,
    data: plan,
  });
});

export const deleteSubscriptionPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const plan = await SubscriptionPlan.findByIdAndDelete(id);
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  res.json({
    success: true,
    message: "Subscription plan deleted successfully",
  });
});
