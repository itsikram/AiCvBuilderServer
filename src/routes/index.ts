import { Router } from "express";
import authRoutes from "./auth.routes.js";
import resumeRoutes from "./resume.routes.js";
import coverLetterRoutes from "./coverLetter.routes.js";
import paymentRoutes from "./payment.routes.js";
import templateRoutes from "./template.routes.js";
import blogRoutes from "./blog.routes.js";
import adminRoutes from "./admin.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/resumes", resumeRoutes);
router.use("/cover-letters", coverLetterRoutes);
router.use("/payments", paymentRoutes);
router.use("/templates", templateRoutes);
router.use("/blogs", blogRoutes);
router.use("/admin", adminRoutes);

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "ChakriCV API is running", version: "1.0.0" });
});

export default router;
