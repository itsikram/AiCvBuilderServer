import { Response } from "express";
import { prisma } from "../config/database.js";
import type { Language } from "../generated/prisma/client.js";
import { serializeBlog } from "../models/serializers.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

const authorSelect = { select: { id: true, name: true, avatar: true } } as const;

export const getPublishedBlogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = 10;
  const language = req.query.language === "bn" || req.query.language === "en" ? (req.query.language as Language) : undefined;

  const where = { isPublished: true, ...(language && { language }) };

  const [blogs, total] = await Promise.all([
    prisma.blog.findMany({
      where,
      // Lists leave out the post body
      omit: { content: true },
      include: { author: authorSelect },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.blog.count({ where }),
  ]);

  res.json({ success: true, data: { blogs: blogs.map(serializeBlog), total, page } });
});

export const getBlogBySlug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const found = await prisma.blog.findFirst({ where: { slug: String(req.params.slug), isPublished: true }, select: { id: true } });
  if (!found) throw new ApiError(404, "Blog not found");

  const blog = await prisma.blog.update({
    where: { id: found.id },
    data: { viewCount: { increment: 1 } },
    include: { author: authorSelect },
  });

  res.json({ success: true, data: serializeBlog(blog) });
});
