import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";

// Business analytics for Admin -> Analytics: KPIs against the previous period, trends, the
// sign-up funnel and breakdowns. Read from the source tables (users, resumes, payments,
// activity_logs) plus the daily counters in `analytics`, grouped by Bangladesh calendar day.
// The activity log is pruned after ACTIVITY_RETENTION_DAYS, so "active users" and AI tool
// counts only reach back that far.

export const INSIGHT_RANGES = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type InsightRange = keyof typeof INSIGHT_RANGES;
export const isInsightRange = (value: unknown): value is InsightRange =>
  typeof value === "string" && Object.hasOwn(INSIGHT_RANGES, value);

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Bangladesh is UTC+6 all year (no daylight saving). */
const BD_OFFSET_MS = 6 * HOUR_MS;

/** The Bangladesh calendar date of an instant, as a UTC-midnight Date for arithmetic. */
const bdDate = (instant: Date) => {
  const shifted = new Date(instant.getTime() + BD_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};
/** The instant a Bangladesh calendar date (UTC-midnight Date) starts. */
const bdStart = (date: Date) => new Date(date.getTime() - BD_OFFSET_MS);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
/** The last Bangladesh date inside a period that ends at `end` (exclusive). */
const lastDay = (end: Date) => bdDate(new Date(end.getTime() - 1));
const isoMonth = (date: Date) => date.toISOString().slice(0, 7);

export interface Period {
  start: Date;
  end: Date;
  /** Bucket keys (YYYY-MM-DD or YYYY-MM, Bangladesh time) covering the period, oldest first */
  keys: string[];
}

/**
 * The current period (the last N Bangladesh days including today, or the last 12 months
 * including this one) and the previous period of the same length just before it.
 */
export const periodsFor = (range: InsightRange, now = new Date()) => {
  const today = bdDate(now);
  if (range === "365d") {
    const monthStart = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    const keys = Array.from({ length: 12 }, (_, i) => isoMonth(monthStart(i - 11)));
    const current: Period = { start: bdStart(monthStart(-11)), end: now, keys };
    const previous: Period = { start: bdStart(monthStart(-23)), end: current.start, keys: [] };
    return { bucket: "month" as const, current, previous };
  }
  const days = INSIGHT_RANGES[range];
  const first = new Date(today.getTime() - (days - 1) * DAY_MS);
  const keys = Array.from({ length: days }, (_, i) => isoDay(new Date(first.getTime() + i * DAY_MS)));
  const current: Period = { start: bdStart(first), end: now, keys };
  const previous: Period = { start: new Date(current.start.getTime() - days * DAY_MS), end: current.start, keys: [] };
  return { bucket: "day" as const, current, previous };
};

type Bucket = "day" | "month";
/** SQL for an instant column's Bangladesh day or month key. The format is a fixed literal. */
const keyOf = (column: string, bucket: Bucket) =>
  Prisma.raw(`DATE_FORMAT(DATE_ADD(${column}, INTERVAL 6 HOUR), '${bucket === "day" ? "%Y-%m-%d" : "%Y-%m"}')`);

const num = (value: unknown) => (typeof value === "bigint" ? Number(value) : Number(value ?? 0)) || 0;
const round2 = (value: number) => Math.round(value * 100) / 100;

type KeyedRow = { k: string } & Record<string, unknown>;
const toMap = (rows: KeyedRow[], field: string) => new Map(rows.map((row) => [row.k, num(row[field])]));

/** Totals for one period, the figures behind the KPI tiles. */
const periodTotals = async ({ start, end }: Pick<Period, "start" | "end">) => {
  const [newUsers, active, counters, revenue, payers, trials] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(DISTINCT userId) n FROM activity_logs WHERE userId IS NOT NULL AND createdAt >= ${start} AND createdAt < ${end}`,
    prisma.analytics.aggregate({
      where: { date: { gte: bdDate(start), lte: lastDay(end) } },
      _sum: { resumesCreated: true, aiRequests: true, pdfExports: true },
    }),
    prisma.payment.aggregate({ where: { status: "completed", updatedAt: { gte: start, lt: end } }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(DISTINCT userId) n FROM payments WHERE status = 'completed' AND updatedAt >= ${start} AND updatedAt < ${end}`,
    prisma.user.count({ where: { trialStartedAt: { gte: start, lt: end } } }),
  ]);
  return {
    newUsers,
    activeUsers: num(active[0]?.n),
    cvsCreated: counters._sum.resumesCreated ?? 0,
    pdfDownloads: counters._sum.pdfExports ?? 0,
    aiRequests: counters._sum.aiRequests ?? 0,
    trialsStarted: trials,
    paidOrders: revenue._count,
    payingCustomers: num(payers[0]?.n),
    revenue: round2(revenue._sum.amount ?? 0),
  };
};

export type PeriodTotals = Awaited<ReturnType<typeof periodTotals>>;

/** One point per bucket for the trend charts. */
const periodSeries = async ({ start, end, keys }: Period, bucket: Bucket) => {
  const counterKey = Prisma.raw(`DATE_FORMAT(date, '${bucket === "day" ? "%Y-%m-%d" : "%Y-%m"}')`);
  const [users, active, payments, counters, trials] = await Promise.all([
    prisma.$queryRaw<KeyedRow[]>`
      SELECT ${keyOf("createdAt", bucket)} k, COUNT(*) n FROM users WHERE createdAt >= ${start} AND createdAt < ${end} GROUP BY k`,
    prisma.$queryRaw<KeyedRow[]>`
      SELECT ${keyOf("createdAt", bucket)} k, COUNT(DISTINCT userId) n FROM activity_logs
      WHERE userId IS NOT NULL AND createdAt >= ${start} AND createdAt < ${end} GROUP BY k`,
    prisma.$queryRaw<KeyedRow[]>`
      SELECT ${keyOf("updatedAt", bucket)} k, SUM(amount) revenue, COUNT(*) n FROM payments
      WHERE status = 'completed' AND updatedAt >= ${start} AND updatedAt < ${end} GROUP BY k`,
    prisma.$queryRaw<KeyedRow[]>`
      SELECT ${counterKey} k, SUM(resumesCreated) cvs, SUM(pdfExports) pdfs, SUM(aiRequests) ai FROM analytics
      WHERE date >= ${bdDate(start)} AND date <= ${lastDay(end)} GROUP BY k`,
    prisma.$queryRaw<KeyedRow[]>`
      SELECT ${keyOf("trialStartedAt", bucket)} k, COUNT(*) n FROM users
      WHERE trialStartedAt >= ${start} AND trialStartedAt < ${end} GROUP BY k`,
  ]);
  const maps = {
    newUsers: toMap(users, "n"),
    activeUsers: toMap(active, "n"),
    revenue: toMap(payments, "revenue"),
    paidOrders: toMap(payments, "n"),
    cvsCreated: toMap(counters, "cvs"),
    pdfDownloads: toMap(counters, "pdfs"),
    aiRequests: toMap(counters, "ai"),
    trialsStarted: toMap(trials, "n"),
  };
  return keys.map((key) => ({
    key,
    newUsers: maps.newUsers.get(key) ?? 0,
    activeUsers: maps.activeUsers.get(key) ?? 0,
    cvsCreated: maps.cvsCreated.get(key) ?? 0,
    pdfDownloads: maps.pdfDownloads.get(key) ?? 0,
    aiRequests: maps.aiRequests.get(key) ?? 0,
    trialsStarted: maps.trialsStarted.get(key) ?? 0,
    paidOrders: maps.paidOrders.get(key) ?? 0,
    revenue: round2(maps.revenue.get(key) ?? 0),
  }));
};

/** What the people who signed up in the period went on to do (each a share of sign-ups). */
const signupFunnel = async ({ start, end }: Pick<Period, "start" | "end">) => {
  const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*) signedUp,
      SUM(u.resumesCreated > 0 OR EXISTS (SELECT 1 FROM resumes r WHERE r.userId = u.id)) madeCv,
      SUM(EXISTS (SELECT 1 FROM resumes r WHERE r.userId = u.id AND r.lastExportedAt IS NOT NULL)
        OR EXISTS (SELECT 1 FROM activity_logs a WHERE a.userId = u.id AND a.type = 'cv.exported')) downloaded,
      SUM(u.trialStartedAt IS NOT NULL) startedTrial,
      SUM(EXISTS (SELECT 1 FROM payments p WHERE p.userId = u.id AND p.status = 'completed')) paid,
      SUM(u.createdAt < ${new Date(end.getTime() - DAY_MS)}) returnCohort,
      SUM(u.createdAt < ${new Date(end.getTime() - DAY_MS)} AND EXISTS (
        SELECT 1 FROM activity_logs a WHERE a.userId = u.id AND a.createdAt >= DATE_ADD(u.createdAt, INTERVAL 1 DAY))) returned,
      SUM(u.password IS NULL AND u.googleId IS NOT NULL) viaGoogle,
      SUM(u.referredById IS NOT NULL) referred,
      SUM(u.language = 'bn') bangla
    FROM users u WHERE u.createdAt >= ${start} AND u.createdAt < ${end}`;
  const value = (key: string) => num(row?.[key]);
  return {
    stages: [
      { id: "signedUp", label: "Signed up", count: value("signedUp") },
      { id: "madeCv", label: "Made a CV", count: value("madeCv") },
      { id: "downloaded", label: "Downloaded a CV", count: value("downloaded") },
      { id: "startedTrial", label: "Started the free trial", count: value("startedTrial") },
      { id: "paid", label: "Paid", count: value("paid") },
    ],
    /** Of the users who signed up at least a day before the period ended, how many came back a day or more later */
    returning: { cohort: value("returnCohort"), returned: value("returned") },
    signupMethod: [
      { id: "google", label: "Google", count: value("viaGoogle") },
      { id: "email", label: "Email and password", count: value("signedUp") - value("viaGoogle") },
    ],
    signupLanguage: [
      { id: "en", label: "English", count: value("signedUp") - value("bangla") },
      { id: "bn", label: "Bangla", count: value("bangla") },
    ],
    referred: value("referred"),
  };
};

const PASS_NAMES: Record<string, string> = { weekly: "7-day pass", monthly: "30-day pass", yearly: "1-year pass" };

/** One row per item name (a product bought under different plans is still one item), largest first. */
const mergeByLabel = (rows: Array<{ label: string; revenue: number; count: number }>) => {
  const merged = new Map<string, { label: string; revenue: number; count: number }>();
  for (const row of rows) {
    const current = merged.get(row.label) ?? { label: row.label, revenue: 0, count: 0 };
    current.revenue += row.revenue;
    current.count += row.count;
    merged.set(row.label, current);
  }
  return [...merged.values()].map((row) => ({ ...row, revenue: round2(row.revenue) })).sort((a, b) => b.revenue - a.revenue);
};

/** Revenue by what was bought and by payment method, AI tools and templates used. */
const breakdowns = async ({ start, end }: Pick<Period, "start" | "end">) => {
  const now = new Date();
  const [items, providers, aiFeatures, templates, cvLanguages, products, plans, templateNames, trialUsers, premiumUsers, totalUsers] =
    await Promise.all([
      prisma.$queryRaw<Array<{ productSlug: string | null; planSlug: string; billingCycle: string | null; revenue: number; n: bigint }>>`
        SELECT productSlug, planSlug, billingCycle, SUM(amount) revenue, COUNT(*) n FROM payments
        WHERE status = 'completed' AND updatedAt >= ${start} AND updatedAt < ${end}
        GROUP BY productSlug, planSlug, billingCycle ORDER BY revenue DESC LIMIT 50`,
      prisma.$queryRaw<Array<{ provider: string; revenue: number; n: bigint }>>`
        SELECT provider, SUM(amount) revenue, COUNT(*) n FROM payments
        WHERE status = 'completed' AND updatedAt >= ${start} AND updatedAt < ${end} GROUP BY provider ORDER BY revenue DESC`,
      prisma.$queryRaw<Array<{ feature: string | null; n: bigint }>>`
        SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.feature')) feature, COUNT(*) n FROM activity_logs
        WHERE type = 'ai.used' AND createdAt >= ${start} AND createdAt < ${end} GROUP BY feature ORDER BY n DESC LIMIT 10`,
      prisma.$queryRaw<Array<{ templateId: string; n: bigint }>>`
        SELECT templateId, COUNT(*) n FROM resumes WHERE createdAt >= ${start} AND createdAt < ${end}
        GROUP BY templateId ORDER BY n DESC LIMIT 8`,
      prisma.$queryRaw<Array<{ language: string; n: bigint }>>`
        SELECT language, COUNT(*) n FROM resumes WHERE createdAt >= ${start} AND createdAt < ${end} GROUP BY language`,
      prisma.product.findMany({ select: { slug: true, name: true } }),
      prisma.subscriptionPlan.findMany({ select: { slug: true, name: true } }),
      prisma.template.findMany({ select: { slug: true, name: true } }),
      prisma.user.count({ where: { subscriptionPlan: "premium", subscriptionStatus: "trial", subscriptionExpiresAt: { gt: now } } }),
      prisma.user.count({
        where: {
          subscriptionPlan: "premium",
          subscriptionStatus: "active",
          OR: [{ subscriptionExpiresAt: null }, { subscriptionExpiresAt: { gt: now } }],
        },
      }),
      prisma.user.count(),
    ]);
  const productName = new Map(products.map((p) => [p.slug, p.name]));
  const planName = new Map(plans.map((p) => [p.slug, p.name]));
  const templateName = new Map(templateNames.map((t) => [t.slug, t.name]));
  return {
    revenueByItem: mergeByLabel(
      items.map((item) => ({
        label: item.productSlug
          ? productName.get(item.productSlug) ?? item.productSlug
          : `${planName.get(item.planSlug) ?? item.planSlug}${item.billingCycle ? ` ${PASS_NAMES[item.billingCycle] ?? item.billingCycle}` : ""}`,
        revenue: num(item.revenue),
        count: num(item.n),
      }))
    ).slice(0, 12),
    revenueByMethod: providers.map((row) => ({ label: row.provider, revenue: round2(num(row.revenue)), count: num(row.n) })),
    aiFeatures: aiFeatures.map((row) => ({ label: row.feature || "Other", count: num(row.n) })),
    templates: templates.map((row) => ({ label: templateName.get(row.templateId) ?? row.templateId, count: num(row.n) })),
    cvLanguages: cvLanguages.map((row) => ({ label: row.language === "bn" ? "Bangla" : "English", count: num(row.n) })),
    /** Everyone's plan right now, not limited to the period */
    planMix: [
      { id: "free", label: "Free", count: totalUsers - trialUsers - premiumUsers },
      { id: "trial", label: "Free trial", count: trialUsers },
      { id: "premium", label: "Paid Premium", count: premiumUsers },
    ],
  };
};

export const getInsights = async (range: InsightRange) => {
  const { bucket, current, previous } = periodsFor(range);
  const [totals, previousTotals, series, funnel, split] = await Promise.all([
    periodTotals(current),
    periodTotals(previous),
    periodSeries(current, bucket),
    signupFunnel(current),
    breakdowns(current),
  ]);
  return {
    range,
    bucket,
    period: { start: current.start, end: current.end },
    previousPeriod: { start: previous.start, end: previous.end },
    totals,
    previousTotals,
    series,
    funnel,
    ...split,
  };
};

// What users put on their CVs: the job titles they target and the skills they list. Counted
// once per user, so one person with ten CVs doesn't dominate. Used as keyword ideas.

const MAX_CVS_SCANNED = 5000;
const tidy = (value: string) => value.replace(/\s+/g, " ").trim();

const topCounts = (perUser: Map<string, Set<string>>, labels: Map<string, Map<string, number>>, limit: number) =>
  [...perUser.entries()]
    .map(([key, users]) => {
      // Show the spelling most people used
      const spellings = [...(labels.get(key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
      return { label: spellings[0]?.[0] ?? key, users: users.size };
    })
    .sort((a, b) => b.users - a.users || a.label.localeCompare(b.label))
    .slice(0, limit);

export const getCvKeywords = async (days: number) => {
  const start = new Date(Date.now() - days * DAY_MS);
  const rows = await prisma.$queryRaw<Array<{ userId: string; title: string | null; skills: unknown }>>`
    SELECT userId, JSON_UNQUOTE(JSON_EXTRACT(content, '$.personalInfo.jobTitle')) title, JSON_EXTRACT(content, '$.skills') skills
    FROM resumes WHERE updatedAt >= ${start} ORDER BY updatedAt DESC LIMIT ${MAX_CVS_SCANNED}`;

  const titleUsers = new Map<string, Set<string>>();
  const titleLabels = new Map<string, Map<string, number>>();
  const skillUsers = new Map<string, Set<string>>();
  const skillLabels = new Map<string, Map<string, number>>();
  const add = (users: Map<string, Set<string>>, labels: Map<string, Map<string, number>>, raw: string, userId: string) => {
    const label = tidy(raw);
    if (label.length < 2 || label.length > 80 || label.toLowerCase() === "null") return;
    const key = label.toLowerCase();
    if (!users.has(key)) users.set(key, new Set());
    users.get(key)!.add(userId);
    const spellings = labels.get(key) ?? new Map<string, number>();
    spellings.set(label, (spellings.get(label) ?? 0) + 1);
    labels.set(key, spellings);
  };

  for (const row of rows) {
    if (row.title) add(titleUsers, titleLabels, row.title, row.userId);
    let skills = row.skills;
    if (typeof skills === "string") {
      try {
        skills = JSON.parse(skills);
      } catch {
        skills = [];
      }
    }
    if (!Array.isArray(skills)) continue;
    for (const skill of skills.slice(0, 60)) {
      const name = typeof skill === "string" ? skill : typeof skill?.name === "string" ? skill.name : "";
      if (name) add(skillUsers, skillLabels, name, row.userId);
    }
  }

  return {
    cvsScanned: rows.length,
    jobTitles: topCounts(titleUsers, titleLabels, 20),
    skills: topCounts(skillUsers, skillLabels, 24),
  };
};
