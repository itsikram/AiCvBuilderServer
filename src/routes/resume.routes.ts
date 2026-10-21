import { Router } from "express";
import * as resumeController from "../controllers/resume.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createResumeSchema,
  updateResumeSchema,
  generateResumeSchema,
  tailorResumeSchema,
  improveResumeSchema,
  atsCheckSchema,
  resumeIdParamSchema,
  updateTemplateSchema,
  reorderSectionsSchema,
  experienceItemSchema,
  writeSummarySchema,
  rewriteBulletsSchema,
  suggestSkillsSchema,
  grammarSchema,
  translateResumeSchema,
  importTextSchema,
} from "../validators/resume.validator.js";
import * as resumeAiController from "../controllers/resumeAi.controller.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import multer from "multer";
import { SUPPORTED_CV_MIME_TYPES } from "../services/pdf-extraction.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!(SUPPORTED_CV_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new Error("Only PDF or Word (.docx) files are supported"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.get("/public/:slug", resumeController.getPublicResume);

router.use(authenticate);

router.get("/", resumeController.getResumes);
router.post("/", validate(createResumeSchema), resumeController.createResume);

router.get("/ai/quota", resumeAiController.getQuota);
router.post("/ai/generate", aiLimiter, validate(generateResumeSchema), resumeController.generateWithAI);
router.post("/ai/tailor", aiLimiter, validate(tailorResumeSchema), resumeAiController.tailorResume);
router.post("/ai/write-summary", aiLimiter, validate(writeSummarySchema), resumeAiController.writeSummary);
router.post("/ai/rewrite-bullets", aiLimiter, validate(rewriteBulletsSchema), resumeAiController.rewriteBullets);
router.post("/ai/suggest-skills", aiLimiter, validate(suggestSkillsSchema), resumeAiController.suggestSkills);
router.post("/ai/grammar", aiLimiter, validate(grammarSchema), resumeAiController.grammarCheck);
router.post("/ai/improve", aiLimiter, validate(improveResumeSchema), resumeController.improveWithAI);
router.post("/ai/ats-check", aiLimiter, validate(atsCheckSchema), resumeController.checkATS);
router.post("/upload-parse", aiLimiter, upload.single("file"), resumeController.uploadAndParseResume);
router.post("/import-text", aiLimiter, validate(importTextSchema), resumeController.importFromText);

router.use("/:id", validate(resumeIdParamSchema, "params"));
router.get("/:id", resumeController.getResume);
router.get("/:id/uploaded-file", resumeController.downloadUploadedResume);
router.patch("/:id/template", validate(updateTemplateSchema), resumeController.updateTemplate);
router.patch("/:id", validate(updateResumeSchema), resumeController.updateResume);
router.delete("/:id", resumeController.deleteResume);
router.post("/:id/duplicate", resumeController.duplicateResume);
router.post("/:id/toggle-public", resumeController.togglePublic);
router.post("/:id/translate", aiLimiter, validate(translateResumeSchema), resumeAiController.translateResume);
router.get("/:id/export-pdf", resumeController.exportPDF);
router.patch("/:id/sections", validate(reorderSectionsSchema), resumeController.reorderSections);
router.post("/:id/experience", validate(experienceItemSchema), resumeController.addExperience);

export default router;
