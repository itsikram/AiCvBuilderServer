import { Router } from "express";
import authRoutes from "./auth.routes.js";
import resumeRoutes from "./resume.routes.js";
import coverLetterRoutes from "./coverLetter.routes.js";
import paymentRoutes from "./payment.routes.js";
import templateRoutes from "./template.routes.js";
import blogRoutes from "./blog.routes.js";
import adminRoutes from "./admin.routes.js";
import pageContentRoutes from "./pageContent.routes.js";
import contactRoutes from "./contact.routes.js";
import jobsRoutes from "./jobs.routes.js";
import screeningRoutes from "./screening.routes.js";
import { getDatabaseStatus } from "../config/database.js";
import { integrations } from "../services/settings.service.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/resumes", resumeRoutes);
router.use("/cover-letters", coverLetterRoutes);
router.use("/payments", paymentRoutes);
router.use("/templates", templateRoutes);
router.use("/blogs", blogRoutes);
router.use("/page-content", pageContentRoutes);
router.use("/admin", adminRoutes);
router.use("/contact", contactRoutes);
router.use("/jobs", jobsRoutes);
router.use("/screenings", screeningRoutes);

// Public, non-secret settings the frontend needs at runtime (set in Admin -> Settings)
router.get("/config", async (_req, res, next) => {
  try {
    const { clientId } = await integrations.google();
    res.set("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: { googleClientId: clientId } });
  } catch (error) {
    next(error);
  }
});

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "AI CV Builder BD API is running",
    version: "1.0.0",
    database: getDatabaseStatus(),
  });
});

export default router;
