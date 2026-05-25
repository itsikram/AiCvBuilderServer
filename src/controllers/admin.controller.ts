import { Response } from "express";
import { User } from "../models/User.js";
import { Resume } from "../models/Resume.js";
import { Payment } from "../models/Payment.js";
import { Coupon } from "../models/Coupon.js";
import { Template } from "../models/Template.js";
import { Blog } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { getDashboardStats } from "../services/analytics.service.js";
import { geminiKeyManager } from "../services/ai/gemini-key-manager.js";
import { uploadBuffer } from "../services/cloudinary.service.js";
import { normalizeLanguage } from "../utils/language.js";

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
