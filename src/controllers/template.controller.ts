import { Response } from "express";
import { prisma } from "../config/database.js";
import type { TemplateCategory } from "../generated/prisma/client.js";
import { serializeTemplate } from "../models/serializers.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { getUserLimits } from "../services/subscription.service.js";

const CATEGORIES: readonly string[] = ["ats", "modern", "bangladeshi", "creative"];

export const getTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = req.query.category as string | undefined;
  // An unknown category matches nothing, as it did before
  if (category && !CATEGORIES.includes(category)) {
    res.json({ success: true, data: [] });
    return;
  }

  const templates = await prisma.template.findMany({
    where: { isActive: true, ...(category && { category: category as TemplateCategory }) },
    orderBy: { sortOrder: "asc" },
  });
  let data: Array<ReturnType<typeof serializeTemplate> & { locked?: boolean }> = templates.map(serializeTemplate);

  if (req.user) {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user) {
      const limits = await getUserLimits(user);
      if (!limits.premiumTemplates) {
        data = data.map((t) => ({ ...t, locked: t.isPremium }));
      }
    }
  }

  res.json({ success: true, data });
});

export const getTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const template = await prisma.template.findFirst({ where: { slug: String(req.params.slug), isActive: true } });
  if (!template) throw new ApiError(404, "Template not found");
  res.json({ success: true, data: serializeTemplate(template) });
});
