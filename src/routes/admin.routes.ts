import { Router } from "express";
import multer from "multer";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";

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
router.get("/users", adminController.getUsers);
router.patch("/users/:id", adminController.updateUser);
router.patch("/users/:id/subscription", adminController.updateUserSubscription);
router.delete("/users/:id", adminController.deleteUser);
router.get("/payments", adminController.getPayments);
router.get("/bkash/config", adminController.getBkashConfig);
router.put("/bkash/config", adminController.updateBkashConfig);
router.get("/bkash/payments", adminController.getBkashPayments);
router.patch("/bkash/payments/:id", adminController.reviewBkashPayment);
router.get("/coupons", adminController.getCoupons);
router.post("/coupons", adminController.createCoupon);
router.patch("/coupons/:id", adminController.updateCoupon);
router.get("/templates", adminController.manageTemplates);
router.post("/templates", adminController.manageTemplates);
router.patch("/templates/:id", adminController.updateTemplate);
router.get("/blogs", adminController.manageBlogs);
router.post("/blogs", uploadBlogCover, adminController.createBlog);
router.patch("/blogs/:id", uploadBlogCover, adminController.updateBlog);
router.get("/gemini-keys", adminController.getGeminiKeyStatus);

// Page Content Management (CMS)
router.get("/page-content", adminController.getAllPageContents);
router.get("/page-content/:pageId", adminController.getPageContent);
router.post("/page-content", adminController.createPageContent);
router.patch("/page-content/:id", adminController.updatePageContent);
router.delete("/page-content/:id", adminController.deletePageContent);

// Admin Settings Management (env file values)
router.get("/settings", adminController.getAdminSettings);
router.put("/settings", adminController.updateAdminSetting);
router.delete("/settings/:key", adminController.deleteAdminSetting);

// Subscription Plan Management
router.get("/plans", adminController.getSubscriptionPlans);
router.post("/plans", adminController.createSubscriptionPlan);
router.patch("/plans/:id", adminController.updateSubscriptionPlan);
router.delete("/plans/:id", adminController.deleteSubscriptionPlan);

export default router;
