import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate, requireAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/users", adminController.getUsers);
router.patch("/users/:id", adminController.updateUser);
router.patch("/users/:id/subscription", adminController.updateUserSubscription);
router.delete("/users/:id", adminController.deleteUser);
router.get("/payments", adminController.getPayments);
router.get("/coupons", adminController.getCoupons);
router.post("/coupons", adminController.createCoupon);
router.patch("/coupons/:id", adminController.updateCoupon);
router.get("/templates", adminController.manageTemplates);
router.post("/templates", adminController.manageTemplates);
router.patch("/templates/:id", adminController.updateTemplate);
router.get("/blogs", adminController.manageBlogs);
router.post("/blogs", adminController.createBlog);
router.patch("/blogs/:id", adminController.updateBlog);

export default router;
