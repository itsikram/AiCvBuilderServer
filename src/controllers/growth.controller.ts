import { Response } from "express";
import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { prisma } from "../config/database.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { serializeJobCircular, serializeOrder, serializeProduct } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateAccessCode, normalizeCode } from "../services/rewards.service.js";
import { updateOrderByAdmin } from "../services/order.service.js";

// Admin endpoints for products, orders, access codes and job circulars, and the public job
// circular endpoints. Bodies are checked with zod here; unknown keys are dropped.

const parse = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.errors[0];
    throw new ApiError(400, `${first.path.join(".") || "body"}: ${first.message}`);
  }
  return result.data;
};

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return date;
  });

// ---------------------------------------------------------------------------------------------
// Products (Admin -> Products)
// ---------------------------------------------------------------------------------------------

const productFields = {
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000),
  price: z.coerce.number().min(0).max(1_000_000),
  quantity: z.coerce.number().int().min(1).max(100_000),
  validDays: z.coerce.number().int().min(0).max(3650),
  deliveryDays: z.coerce.number().int().min(0).max(365),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
};
const createProductSchema = z.object({
  ...productFields,
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/, "Use lowercase letters, numbers and dashes"),
  kind: z.enum(["pdf_credits", "ai_credits", "screening_credits", "service"]),
  description: productFields.description.default(""),
  quantity: productFields.quantity.default(1),
  validDays: productFields.validDays.default(0),
  deliveryDays: productFields.deliveryDays.default(0),
  isActive: productFields.isActive.default(true),
  sortOrder: productFields.sortOrder.default(0),
});
const updateProductSchema = z.object(productFields).partial();

export const listProducts = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const products = await prisma.product.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { orders: true } } } });
  res.json({
    success: true,
    data: products.map(({ _count, ...product }) => ({ ...serializeProduct(product), orderCount: _count.orders })),
  });
});

export const createProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = parse(createProductSchema, req.body);
  if (await prisma.product.findUnique({ where: { slug: data.slug } })) throw new ApiError(409, "A product with this slug already exists");
  const product = await prisma.product.create({ data });
  res.status(201).json({ success: true, data: serializeProduct(product) });
});

export const updateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = parse(updateProductSchema, req.body);
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data }).catch(() => {
    throw new ApiError(404, "Product not found");
  });
  res.json({ success: true, data: serializeProduct(product) });
});

// ---------------------------------------------------------------------------------------------
// Orders (Admin -> Orders)
// ---------------------------------------------------------------------------------------------

const ORDER_STATUSES = ["awaiting_payment", "paid", "in_progress", "delivered", "cancelled"] as const;

export const listOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === "string" && (ORDER_STATUSES as readonly string[]).includes(req.query.status) ? req.query.status : undefined;
  const services = req.query.kind === "service";
  const orders = await prisma.order.findMany({
    where: {
      ...(status && { status: status as (typeof ORDER_STATUSES)[number] }),
      ...(services && { product: { kind: "service" } }),
    },
    include: {
      product: true,
      user: { select: { id: true, name: true, email: true } },
      payment: { select: { provider: true, transactionId: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const waiting = await prisma.order.count({ where: { status: { in: ["paid", "in_progress"] } } });
  res.json({
    success: true,
    data: {
      orders: orders.map(({ payment, ...order }) => ({ ...serializeOrder(order), payment })),
      waiting,
    },
  });
});

export const updateOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await updateOrderByAdmin(String(req.params.id), req.body ?? {}, req.user!.email);
  res.json({ success: true, data: serializeOrder(order) });
});

// ---------------------------------------------------------------------------------------------
// Access codes (Admin -> Access codes)
// ---------------------------------------------------------------------------------------------

const createCodeSchema = z.object({
  label: z.string().trim().min(2).max(150),
  code: z.string().trim().max(40).optional(),
  prefix: z.string().trim().max(10).optional(),
  premiumDays: z.coerce.number().int().min(1).max(3650),
  maxUses: z.coerce.number().int().min(1).max(100_000).default(100),
  expiresAt: optionalDate,
});
const updateCodeSchema = z.object({
  label: z.string().trim().min(2).max(150),
  premiumDays: z.coerce.number().int().min(1).max(3650),
  maxUses: z.coerce.number().int().min(1).max(100_000),
  expiresAt: optionalDate,
  isActive: z.boolean(),
}).partial();

export const listAccessCodes = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const codes = await prisma.accessCode.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } });
  res.json({
    success: true,
    data: codes.map(({ createdBy, ...code }) => ({ _id: code.id, ...code, createdBy: createdBy?.name })),
  });
});

export const createAccessCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { code: requested, prefix, expiresAt, ...data } = parse(createCodeSchema, req.body);
  const code = requested ? normalizeCode(requested) : generateAccessCode(prefix);
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new ApiError(400, "Codes use letters, numbers and dashes (4-40 characters)");
  if (await prisma.accessCode.findUnique({ where: { code } })) throw new ApiError(409, "That code already exists");
  const created = await prisma.accessCode.create({ data: { ...data, code, expiresAt: expiresAt ?? null, createdById: req.user!.userId } });
  res.status(201).json({ success: true, data: { _id: created.id, ...created } });
});

export const updateAccessCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = parse(updateCodeSchema, req.body);
  const updated = await prisma.accessCode.update({ where: { id: String(req.params.id) }, data }).catch(() => {
    throw new ApiError(404, "Code not found");
  });
  res.json({ success: true, data: { _id: updated.id, ...updated } });
});

// ---------------------------------------------------------------------------------------------
// Job circulars (Admin -> Job circulars; public /jobs)
// ---------------------------------------------------------------------------------------------

const httpUrl = z
  .union([z.string().trim().url().regex(/^https?:\/\//i, "Must start with http(s)://"), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" ? null : value));
const jobFields = {
  title: z.string().trim().min(3).max(255),
  organization: z.string().trim().min(2).max(255),
  category: z.enum(["government", "bank", "private", "ngo", "international", "other"]),
  language: z.enum(["en", "bn"]),
  summary: z.string().trim().min(20).max(30_000),
  vacancies: z.union([z.coerce.number().int().min(0).max(1_000_000), z.null()]).optional(),
  location: z.string().trim().max(255).nullable().optional(),
  salary: z.string().trim().max(255).nullable().optional(),
  education: z.string().trim().max(500).nullable().optional(),
  applyStart: optionalDate,
  deadline: optionalDate,
  applyUrl: httpUrl,
  sourceUrl: httpUrl,
  photoSpec: z.string().trim().max(255).nullable().optional(),
  isPublished: z.boolean(),
};
const createJobSchema = z.object({
  ...jobFields,
  category: jobFields.category.default("government"),
  language: jobFields.language.default("bn"),
  isPublished: jobFields.isPublished.default(false),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,120}$/, "Use lowercase English letters, numbers and dashes").optional().or(z.literal("")),
});
const updateJobSchema = z.object(jobFields).partial();

/** An English URL slug: the admin's, or one from the title or organisation, plus a short id. */
const jobSlug = (requested: string | undefined, title: string, organization: string) => {
  if (requested) return requested;
  const base = slugify(title, { lower: true, strict: true }) || slugify(organization, { lower: true, strict: true }) || "job-circular";
  return `${base.slice(0, 100)}-${uuidv4().slice(0, 6)}`;
};

export const adminListJobs = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const jobs = await prisma.jobCircular.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  res.json({ success: true, data: jobs.map(serializeJobCircular) });
});

export const createJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { slug, ...data } = parse(createJobSchema, req.body);
  const finalSlug = jobSlug(slug || undefined, data.title, data.organization);
  if (await prisma.jobCircular.findUnique({ where: { slug: finalSlug } })) throw new ApiError(409, "That URL slug is already used");
  const job = await prisma.jobCircular.create({
    data: { ...data, slug: finalSlug, authorId: req.user!.userId, publishedAt: data.isPublished ? new Date() : null } as Prisma.JobCircularUncheckedCreateInput,
  });
  res.status(201).json({ success: true, data: serializeJobCircular(job) });
});

export const updateJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = parse(updateJobSchema, req.body);
  const existing = await prisma.jobCircular.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new ApiError(404, "Job circular not found");
  const job = await prisma.jobCircular.update({
    where: { id: existing.id },
    data: { ...data, ...(data.isPublished && !existing.publishedAt && { publishedAt: new Date() }) } as Prisma.JobCircularUpdateInput,
  });
  res.json({ success: true, data: serializeJobCircular(job) });
});

export const deleteJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.jobCircular.deleteMany({ where: { id: String(req.params.id) } });
  res.json({ success: true, message: "Job circular deleted" });
});

const CATEGORIES = ["government", "bank", "private", "ngo", "international", "other"] as const;

/** Published circulars, newest first; `open=1` hides ones past their deadline. */
export const listJobs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const category = typeof req.query.category === "string" && (CATEGORIES as readonly string[]).includes(req.query.category) ? req.query.category : undefined;
  const language = req.query.language === "en" || req.query.language === "bn" ? req.query.language : undefined;
  // A deadline is a date; it stays open through that whole day in Bangladesh
  const openCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where: Prisma.JobCircularWhereInput = {
    isPublished: true,
    ...(category && { category: category as (typeof CATEGORIES)[number] }),
    ...(language && { language }),
    ...(req.query.open === "1" && { OR: [{ deadline: null }, { deadline: { gte: openCutoff } }] }),
  };
  const [jobs, total] = await Promise.all([
    prisma.jobCircular.findMany({ where, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.jobCircular.count({ where }),
  ]);
  // The list doesn't need the full text
  res.json({
    success: true,
    data: {
      jobs: jobs.map((job) => ({ ...serializeJobCircular(job), summary: job.summary.slice(0, 220) })),
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

export const getJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await prisma.jobCircular.findFirst({ where: { slug: String(req.params.slug), isPublished: true } });
  if (!job) throw new ApiError(404, "Job circular not found");
  res.json({ success: true, data: serializeJobCircular(job) });
});
