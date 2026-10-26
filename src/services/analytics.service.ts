import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { serializeAnalytics } from "../models/serializers.js";

/** A calendar day (server time zone) as the UTC midnight a DATE column stores without shifting */
const dayOf = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

const getToday = () => dayOf(new Date());

const defaultMetrics = {
  newUsers: 0,
  activeUsers: 0,
  resumesCreated: 0,
  resumesUploaded: 0,
  aiRequests: 0,
  pdfExports: 0,
  revenue: 0,
  premiumConversions: 0,
};

export type AnalyticsMetric = keyof typeof defaultMetrics;

/** Adds to today's counters, creating today's row on first use. */
export const incrementMetrics = async (values: Partial<Record<AnalyticsMetric, number>>): Promise<void> => {
  const date = getToday();
  const increments = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { increment: value }]));
  const upsert = () => prisma.analytics.upsert({ where: { date }, create: { date, ...values }, update: increments });
  try {
    await upsert();
  } catch (error) {
    // Two requests created today's row at once: the loser retries, now as an update
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await upsert();
      return;
    }
    throw error;
  }
};

export const trackEvent = async (event: AnalyticsMetric, value = 1): Promise<void> => {
  await incrementMetrics({ [event]: value });
};

export const getAnalyticsRange = async (days = 30) => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = dayOf(start);

  const rows = await prisma.analytics.findMany({ where: { date: { gte: startDate } }, orderBy: { date: "asc" } });
  return rows.map(serializeAnalytics);
};

export const getDashboardStats = async () => {
  const [last30Days, totals] = await Promise.all([
    getAnalyticsRange(30),
    prisma.analytics.aggregate({
      _sum: { revenue: true, newUsers: true, resumesCreated: true, aiRequests: true },
    }),
  ]);

  return {
    last30Days,
    totals: {
      totalRevenue: totals._sum.revenue ?? 0,
      totalUsers: totals._sum.newUsers ?? 0,
      totalResumes: totals._sum.resumesCreated ?? 0,
      totalAiRequests: totals._sum.aiRequests ?? 0,
    },
  };
};
