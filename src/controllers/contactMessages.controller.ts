import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import type { ContactMessage, Prisma } from "../generated/prisma/client.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Admin -> Contact messages: submissions from the public contact form (POST /contact).

const listQuerySchema = z.object({
  status: z.enum(["open", "handled", "all"]).default("open"),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const updateSchema = z.object({ handled: z.boolean() });

const serialize = (message: ContactMessage) => ({ _id: message.id, ...message });

export const listContactMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, "Invalid filters");
  const { status, search, page, limit } = parsed.data;

  const where: Prisma.ContactMessageWhereInput = {};
  if (status !== "all") where.handled = status === "handled";
  if (search) {
    where.OR = [{ name: { contains: search } }, { email: { contains: search } }, { message: { contains: search } }];
  }

  const [messages, total, open] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.count({ where: { handled: false } }),
  ]);

  res.json({
    success: true,
    data: { messages: messages.map(serialize), total, open, page, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const updateContactMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(400, "handled must be true or false");
  const updated = await prisma.contactMessage
    .update({ where: { id: String(req.params.id) }, data: { handled: parsed.data.handled } })
    .catch(() => {
      throw new ApiError(404, "Message not found");
    });
  res.json({ success: true, data: serialize(updated) });
});

export const deleteContactMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.contactMessage.delete({ where: { id: String(req.params.id) } }).catch(() => {
    throw new ApiError(404, "Message not found");
  });
  res.json({ success: true, message: "Message deleted" });
});
