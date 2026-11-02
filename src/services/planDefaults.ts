/**
 * Built-in plan limits, used when a plan row (Admin -> Plans) is missing. -1 means
 * unlimited. Kept apart from subscription.service so settings.service can show them
 * as defaults without an import cycle.
 */
export const BUILT_IN_PLAN_LIMITS = {
  free: {
    maxResumes: 2,
    maxAiRequests: 5,
    watermarkPdf: true,
    premiumTemplates: false,
    atsChecker: false,
    coverLetters: false,
    aiOptimization: false,
  },
  premium: {
    maxResumes: -1,
    maxAiRequests: 100,
    watermarkPdf: false,
    premiumTemplates: true,
    atsChecker: true,
    coverLetters: true,
    aiOptimization: true,
  },
};
