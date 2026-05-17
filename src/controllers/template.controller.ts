import { Response } from "express";
import { Template } from "../models/Template.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { User } from "../models/User.js";
import { getUserLimits } from "../services/subscription.service.js";

export const getTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = req.query.category as string | undefined;
  const filter: Record<string, unknown> = { isActive: true };
  if (category) filter.category = category;

  const templates = await Template.find(filter).sort({ sortOrder: 1 });
  let data = templates.map((t) => t.toObject());

  if (req.user) {
    const user = await User.findById(req.user.userId);
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
  const template = await Template.findOne({ slug: req.params.slug, isActive: true });
  if (!template) throw new ApiError(404, "Template not found");
  res.json({ success: true, data: template });
});
