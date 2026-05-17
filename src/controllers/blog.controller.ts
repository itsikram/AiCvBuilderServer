import { Response } from "express";
import { Blog } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const getPublishedBlogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = 10;
  const language = req.query.language as string | undefined;

  const filter: Record<string, unknown> = { isPublished: true };
  if (language) filter.language = language;

  const [blogs, total] = await Promise.all([
    Blog.find(filter)
      .populate("author", "name avatar")
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-content"),
    Blog.countDocuments(filter),
  ]);

  res.json({ success: true, data: { blogs, total, page } });
});

export const getBlogBySlug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const blog = await Blog.findOne({ slug: req.params.slug, isPublished: true }).populate(
    "author",
    "name avatar"
  );
  if (!blog) throw new ApiError(404, "Blog not found");

  blog.viewCount += 1;
  await blog.save();

  res.json({ success: true, data: blog });
});
