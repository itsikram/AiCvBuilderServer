import { Router } from "express";
import * as resumeController from "../controllers/resume.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createResumeSchema,
  updateResumeSchema,
  generateResumeSchema,
  improveResumeSchema,
  atsCheckSchema,
} from "../validators/resume.validator.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.get("/public/:slug", resumeController.getPublicResume);

router.use(authenticate);

router.get("/", resumeController.getResumes);
router.post("/", validate(createResumeSchema), resumeController.createResume);

router.post("/ai/generate", aiLimiter, validate(generateResumeSchema), resumeController.generateWithAI);
router.post("/ai/improve", aiLimiter, validate(improveResumeSchema), resumeController.improveWithAI);
router.post("/ai/ats-check", aiLimiter, validate(atsCheckSchema), resumeController.checkATS);
router.post("/upload-parse", upload.single("file"), resumeController.uploadAndParseResume);

router.get("/:id", resumeController.getResume);
router.patch("/:id/template", resumeController.updateTemplate);
router.patch("/:id", validate(updateResumeSchema), resumeController.updateResume);
router.delete("/:id", resumeController.deleteResume);
router.post("/:id/duplicate", resumeController.duplicateResume);
router.post("/:id/toggle-public", resumeController.togglePublic);
router.get("/:id/export-pdf", resumeController.exportPDF);
router.patch("/:id/sections", resumeController.reorderSections);
router.post("/:id/experience", resumeController.addExperience);

export default router;
