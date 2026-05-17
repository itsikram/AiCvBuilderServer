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
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select(
    "-password"
  );
  if (!user) throw new ApiError(404, "User not found");
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
  const blog = await Blog.create({ ...req.body, author: req.user!.userId });
  res.status(201).json({ success: true, data: blog });
});

export const updateBlog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: blog });
});
