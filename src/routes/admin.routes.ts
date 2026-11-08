import { Router } from "express";
import multer from "multer";
import * as adminController from "../controllers/admin.controller.js";
import * as growthController from "../controllers/growth.controller.js";
import * as insightsController from "../controllers/insights.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  adminUpdateUserSchema,
  createCouponSchema,
  createTemplateSchema,
  idParamSchema,
  updateCouponSchema,
  updateTemplateSchema,
} from "../validators/admin.validator.js";

const byId = validate(idParamSchema, "params");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are supported for blog cover uploads"));
      return;
    }
    cb(null, true);
  },
});

const uploadBlogCover = upload.single("coverImage");

const router = Router();
router.use(authenticate, requireAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/activity", adminController.getActivity);

// Analytics and SEO & keywords
router.get("/analytics", insightsController.getAnalytics);
router.get("/seo", insightsController.getSeo);
router.post("/seo/test", insightsController.testSeoConnection);
router.post("/seo/keywords", insightsController.createKeywords);
router.patch("/seo/keywords/:id", byId, insightsController.updateKeyword);
router.delete("/seo/keywords/:id", byId, insightsController.deleteKeyword);

// Products, orders, access codes and job circulars
router.get("/products", growthController.listProducts);
router.post("/products", growthController.createProduct);
router.patch("/products/:id", byId, growthController.updateProduct);
router.get("/orders", growthController.listOrders);
router.patch("/orders/:id", byId, growthController.updateOrder);
router.get("/orders/:id/resume", byId, growthController.getOrderResume);
router.get("/access-codes", growthController.listAccessCodes);
router.post("/access-codes", growthController.createAccessCode);
router.patch("/access-codes/:id", byId, growthController.updateAccessCode);
router.get("/jobs", growthController.adminListJobs);
router.post("/jobs", growthController.createJob);
router.patch("/jobs/:id", byId, growthController.updateJob);
router.delete("/jobs/:id", byId, growthController.deleteJob);
router.get("/users", adminController.getUsers);
router.patch("/users/:id", byId, validate(adminUpdateUserSchema), adminController.updateUser);
router.patch("/users/:id/subscription", byId, adminController.updateUserSubscription);
router.delete("/users/:id", byId, adminController.deleteUser);
router.get("/payments", adminController.getPayments);
router.get("/bkash/config", adminController.getBkashConfig);
router.put("/bkash/config", adminController.updateBkashConfig);
router.get("/bkash/payments", adminController.getBkashPayments);
router.patch("/bkash/payments/:id", adminController.reviewBkashPayment);
router.get("/coupons", adminController.getCoupons);
router.post("/coupons", validate(createCouponSchema), adminController.createCoupon);
router.patch("/coupons/:id", byId, validate(updateCouponSchema), adminController.updateCoupon);
router.get("/templates", adminController.manageTemplates);
router.post("/templates", validate(createTemplateSchema), adminController.manageTemplates);
router.patch("/templates/:id", byId, validate(updateTemplateSchema), adminController.updateTemplate);
router.delete("/templates/:id", byId, adminController.deleteTemplate);
router.get("/blogs", adminController.manageBlogs);
router.post("/blogs", uploadBlogCover, adminController.createBlog);
router.patch("/blogs/:id", byId, uploadBlogCover, adminController.updateBlog);
router.get("/gemini-keys", adminController.getGeminiKeyStatus);
router.post("/gemini-keys/test", adminController.testGeminiKeyConnection);

// Page Content Management (CMS)
router.get("/page-content", adminController.getAllPageContents);
router.get("/page-content/:pageId", adminController.getPageContent);
router.post("/page-content", adminController.createPageContent);
router.patch("/page-content/:id", adminController.updatePageContent);
router.delete("/page-content/:id", adminController.deletePageContent);

// Admin Settings Management (env file values)
router.get("/settings", adminController.getAdminSettings);
router.post("/settings/test-email", adminController.sendAdminTestEmail);
router.put("/settings", adminController.updateAdminSetting);
router.delete("/settings/:key", adminController.deleteAdminSetting);

// Subscription Plan Management
router.get("/plans", adminController.getSubscriptionPlans);
router.post("/plans", adminController.createSubscriptionPlan);
router.patch("/plans/:id", adminController.updateSubscriptionPlan);
router.delete("/plans/:id", adminController.deleteSubscriptionPlan);

export default router;
