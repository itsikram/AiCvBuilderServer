import { Response } from "express";
import { prisma } from "../config/database.js";
import type { Prisma } from "../generated/prisma/client.js";
import { serializeResume, withContentDefaults, type IResumeContent } from "../models/Resume.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  createdAt: true,
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const serializeOwner = (user: UserRow | null) =>
  user
    ? {
        _id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        plan: user.subscriptionPlan,
        status: user.subscriptionStatus,
        createdAt: user.createdAt,
      }
    : null;

/** Count of entries per list section, so the admin list can show how complete a CV is */
const sectionCounts = (content: IResumeContent) => ({
  experience: content.experience.length,
  education: content.education.length,
  skills: content.skills.length,
  projects: content.projects.length,
  trainings: content.trainings?.length ?? 0,
  certifications: content.certifications.length,
  languages: content.languages.length,
  references: content.references.length,
});

const boolParam = (value: unknown) => (value === "true" ? true : value === "false" ? false : undefined);

/**
 * GET /admin/resumes: every user's CVs, newest edit first. Query: page, limit, search (CV title,
 * owner's name or email), userId, format, isPublic, uploaded. Rows carry a summary of the content,
 * not the content itself; GET /admin/resumes/:id returns the full CV.
 */
export const listResumes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
  const format = typeof req.query.format === "string" ? req.query.format : "";
  const isPublic = boolParam(req.query.isPublic);
  const uploaded = boolParam(req.query.uploaded);

  const where: Prisma.ResumeWhereInput = {
    ...(userId && { userId }),
    ...((format === "ats" || format === "international" || format === "bangladeshi") && { format }),
    ...(isPublic !== undefined && { isPublic }),
    ...(uploaded === true && { uploadedAt: { not: null } }),
    ...(uploaded === false && { uploadedAt: null }),
    // MySQL's default collation makes `contains` case-insensitive
    ...(search && {
      OR: [
        { title: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ],
    }),
  };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [rows, total, stats] = await Promise.all([
    prisma.resume.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        title: true,
        templateId: true,
        format: true,
        language: true,
        content: true,
        atsScore: true,
        isPublic: true,
        publicSlug: true,
        viewCount: true,
        uploadedFileName: true,
        uploadedAt: true,
        lastExportedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: USER_SELECT },
      },
    }),
    prisma.resume.count({ where }),
    Promise.all([
      prisma.resume.count(),
      prisma.resume.count({ where: { isPublic: true } }),
      prisma.resume.count({ where: { uploadedAt: { not: null } } }),
      prisma.resume.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.resume.groupBy({ by: ["userId"] }).then((groups) => groups.length),
    ]),
  ]);

  const resumes = rows.map(({ content: raw, user, id, ...resume }) => {
    const content = withContentDefaults(raw as unknown as Partial<IResumeContent>);
    const info = content.personalInfo;
    return {
      _id: id,
      ...resume,
      fullName: info.fullName,
      jobTitle: info.jobTitle ?? "",
      email: info.email,
      phone: info.phone,
      location: info.location,
      hasPhoto: Boolean(info.profilePhoto),
      counts: sectionCounts(content),
      topSkills: content.skills.slice(0, 6),
      latestRole: content.experience[0]
        ? { position: content.experience[0].position, company: content.experience[0].company }
        : null,
      user: serializeOwner(user),
    };
  });

  const [allCount, publicCount, uploadedCount, newThisWeek, owners] = stats;
  res.json({
    success: true,
    data: {
      resumes,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { total: allCount, public: publicCount, uploaded: uploadedCount, newThisWeek, owners },
    },
  });
});

/** GET /admin/resumes/:id: one CV in full, with its owner */
export const getResume = asyncHandler(async (req: AuthRequest, res: Response) => {
  const resume = await prisma.resume.findUnique({
    where: { id: String(req.params.id) },
    include: { user: { select: USER_SELECT }, _count: { select: { coverLetters: true } } },
  });
  if (!resume) throw new ApiError(404, "CV not found");

  const { user, _count, ...row } = resume;
  const serialized = serializeResume(row);
  res.json({
    success: true,
    data: {
      ...serialized,
      content: withContentDefaults(serialized.content),
      coverLetterCount: _count.coverLetters,
      user: serializeOwner(user),
    },
  });
});
