import { Analytics } from "../models/Analytics.js";

const getToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const trackEvent = async (
  event: keyof typeof defaultMetrics,
  value = 1
): Promise<void> => {
  const today = getToday();
  await Analytics.findOneAndUpdate(
    { date: today },
    { $inc: { [`metrics.${event}`]: value } },
    { upsert: true }
  );
};

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

export const getAnalyticsRange = async (days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return Analytics.find({ date: { $gte: startDate } }).sort({ date: 1 });
};

export const getDashboardStats = async () => {
  const [last30Days, totals] = await Promise.all([
    getAnalyticsRange(30),
    Analytics.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$metrics.revenue" },
          totalUsers: { $sum: "$metrics.newUsers" },
          totalResumes: { $sum: "$metrics.resumesCreated" },
          totalAiRequests: { $sum: "$metrics.aiRequests" },
        },
      },
    ]),
  ]);

  return {
    last30Days,
    totals: totals[0] || {
      totalRevenue: 0,
      totalUsers: 0,
      totalResumes: 0,
      totalAiRequests: 0,
    },
  };
};
