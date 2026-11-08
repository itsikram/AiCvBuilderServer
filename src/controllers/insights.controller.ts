import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getCvKeywords, getInsights, isInsightRange } from "../services/insights.service.js";
import {
  SEO_DEVICES,
  SEO_RANGES,
  getSearchReport,
  isSearchConsoleConnected,
  isSeoRange,
  keywordLanguage,
  listTrackedKeywords,
  normalizeQuery,
  searchConsoleProperty,
  testSearchConsole,
  type SeoDevice,
} from "../services/searchConsole.service.js";

// Admin -> Analytics (business KPIs) and Admin -> SEO & keywords (Google Search Console
// report, tracked keywords and keyword ideas from users' CVs).

const parse = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.errors[0];
    throw new ApiError(400, `${first.path.join(".") || "body"}: ${first.message}`);
  }
  return result.data;
};

export const getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const range = isInsightRange(req.query.range) ? req.query.range : "30d";
  res.json({ success: true, data: await getInsights(range) });
});

export const getSeo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const range = isSeoRange(req.query.range) ? req.query.range : "28d";
  const country = req.query.country === "all" ? "all" : "bgd";
  const device: SeoDevice = SEO_DEVICES.includes(req.query.device as SeoDevice) ? (req.query.device as SeoDevice) : "all";
  const [keywords, cvKeywords, connected, property] = await Promise.all([
    listTrackedKeywords(),
    getCvKeywords(SEO_RANGES[range]),
    isSearchConsoleConnected(),
    searchConsoleProperty(),
  ]);

  let search: Awaited<ReturnType<typeof getSearchReport>> | null = null;
  let searchError: string | null = null;
  if (connected) {
    try {
      search = await getSearchReport(range, { country, device }, keywords, req.query.refresh === "1");
    } catch (error) {
      // The page still shows the tracked keywords and CV keywords, with the reason beside the setup steps
      searchError = error instanceof ApiError ? error.message : (error as Error).message;
    }
  }

  res.json({
    success: true,
    data: { range, country, device, connected, property, searchError, search, keywords, cvKeywords },
  });
});

export const testSeoConnection = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await testSearchConsole() });
});

const targetPath = z
  .string()
  .trim()
  .max(191)
  .refine((value) => value === "" || value.startsWith("/"), "must start with / (a page on this site, e.g. /cv-format-bangladesh)")
  .transform((value) => value || null);

const keywordText = z
  .string()
  .transform((value) => normalizeQuery(value))
  .pipe(z.string().min(2, "is too short").max(120, "is too long (120 characters at most)"));

const createSchema = z.object({
  /** One or more keywords, e.g. pasted one per line */
  keywords: z.array(keywordText).min(1).max(100),
  targetPath: targetPath.optional(),
  notes: z.string().trim().max(500).optional(),
});

const updateSchema = z.object({
  keyword: keywordText.optional(),
  language: z.enum(["en", "bn"]).optional(),
  targetPath: targetPath.optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null)
    .optional(),
});

export const createKeywords = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = parse(createSchema, req.body);
  const unique = [...new Set(body.keywords)];
  const existing = new Set(
    (await prisma.seoKeyword.findMany({ where: { keyword: { in: unique } }, select: { keyword: true } })).map((row) => row.keyword.toLowerCase())
  );
  const fresh = unique.filter((keyword) => !existing.has(keyword));
  if (fresh.length) {
    await prisma.seoKeyword.createMany({
      data: fresh.map((keyword) => ({
        keyword,
        language: keywordLanguage(keyword),
        targetPath: body.targetPath ?? null,
        notes: body.notes || null,
      })),
      skipDuplicates: true,
    });
  }
  res.status(201).json({ success: true, data: { added: fresh.length, skipped: unique.length - fresh.length } });
});

export const updateKeyword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = parse(updateSchema, req.body);
  try {
    const row = await prisma.seoKeyword.update({ where: { id: String(req.params.id) }, data: body });
    res.json({ success: true, data: row });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new ApiError(404, "Keyword not found");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "That keyword is already tracked");
    throw error;
  }
});

export const deleteKeyword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { count } = await prisma.seoKeyword.deleteMany({ where: { id: String(req.params.id) } });
  if (!count) throw new ApiError(404, "Keyword not found");
  res.json({ success: true, message: "Keyword removed" });
});
