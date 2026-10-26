import type {
  AdminSetting,
  Analytics,
  Blog,
  Coupon,
  CoverLetter,
  PageContent,
  Payment,
  PaymentConfig,
  SubscriptionPlan,
  Template,
} from "../generated/prisma/client.js";

// Responses keep the shape the API had on MongoDB (`_id`, nested limits and metrics,
// populated references), so the client works unchanged.

/** Adds the `_id` alias the client keys everything by */
export const withId = <T extends { id: string }>(row: T) => ({ _id: row.id, ...row });

type UserRef = { id: string; name: string; email?: string; avatar?: string | null };
const userRef = (user: UserRef) => ({ _id: user.id, ...user });

export const serializeTemplate = (template: Template) => ({
  ...withId(template),
  defaultTheme: (template.defaultTheme ?? {}) as Record<string, string>,
});

export const PLAN_LIMIT_KEYS = [
  "maxResumes",
  "maxAiRequests",
  "watermarkPdf",
  "premiumTemplates",
  "atsChecker",
  "coverLetters",
  "aiOptimization",
] as const;

export type PlanLimitsRecord = Pick<SubscriptionPlan, (typeof PLAN_LIMIT_KEYS)[number]>;

export const planLimitsOf = (plan: SubscriptionPlan): PlanLimitsRecord => ({
  maxResumes: plan.maxResumes,
  maxAiRequests: plan.maxAiRequests,
  watermarkPdf: plan.watermarkPdf,
  premiumTemplates: plan.premiumTemplates,
  atsChecker: plan.atsChecker,
  coverLetters: plan.coverLetters,
  aiOptimization: plan.aiOptimization,
});

/** The plan columns set by a `limits` object from the admin API; unknown or mistyped keys are dropped */
export const planLimitsData = (limits: unknown): Partial<PlanLimitsRecord> => {
  if (!limits || typeof limits !== "object") return {};
  const source = limits as Record<string, unknown>;
  const data: Record<string, number | boolean> = {};
  for (const key of PLAN_LIMIT_KEYS) {
    const value = source[key];
    if (key === "maxResumes" || key === "maxAiRequests") {
      if (typeof value === "number" && Number.isFinite(value)) data[key] = Math.trunc(value);
    } else if (typeof value === "boolean") {
      data[key] = value;
    }
  }
  return data as Partial<PlanLimitsRecord>;
};

export const serializePlan = (plan: SubscriptionPlan) => {
  const { maxResumes, maxAiRequests, watermarkPdf, premiumTemplates, atsChecker, coverLetters, aiOptimization, ...rest } =
    plan;
  return {
    _id: plan.id,
    ...rest,
    features: (plan.features ?? []) as string[],
    limits: { maxResumes, maxAiRequests, watermarkPdf, premiumTemplates, atsChecker, coverLetters, aiOptimization },
  };
};

export const serializeCoupon = (coupon: Coupon) => ({
  ...withId(coupon),
  applicablePlans: (coupon.applicablePlans ?? []) as string[],
});

export const serializePayment = (payment: Payment & { user?: UserRef | null }) => {
  const { user, ...rest } = payment;
  return {
    _id: payment.id,
    ...rest,
    providerData: (payment.providerData ?? undefined) as Record<string, unknown> | undefined,
    // Admin lists include the payer, as Mongoose's populate("userId") did
    ...(user !== undefined && { userId: user ? userRef(user) : null }),
  };
};

export const serializeBlog = (blog: Partial<Blog> & { id: string; author?: UserRef | null }) => {
  const { author, authorId, ...rest } = blog;
  return {
    _id: blog.id,
    ...rest,
    tags: (blog.tags ?? []) as string[],
    author: author !== undefined ? (author ? userRef(author) : null) : authorId,
  };
};

export const serializeCoverLetter = (letter: CoverLetter) => withId(letter);

export const serializePageContent = (page: PageContent) => ({
  ...withId(page),
  content: page.content as Record<string, unknown>,
});

export const serializePaymentConfig = (config: PaymentConfig | null) => {
  if (!config) return null;
  const { updatedById, ...rest } = config;
  return { _id: config.id, ...rest, updatedBy: updatedById };
};

export const serializeAdminSetting = (setting: AdminSetting) => {
  const { updatedById, ...rest } = setting;
  return { _id: setting.id, ...rest, updatedBy: updatedById };
};

export const serializeAnalytics = (row: Analytics) => {
  const { id, date, createdAt, updatedAt, ...metrics } = row;
  return { _id: id, date, metrics, createdAt, updatedAt };
};
