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
  interviewQuestionsSchema,
  interviewFeedbackSchema,
  coachChatSchema,
  applyEditsSchema,
} from "../validators/resume.validator.js";
import * as resumeAiController from "../controllers/resumeAi.controller.js";
import * as careerAiController from "../controllers/careerAi.controller.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import { recordAiUse } from "../services/activity.service.js";
import multer from "multer";
import { resolveCvMimeType } from "../services/pdf-extraction.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!resolveCvMimeType(file.mimetype, file.originalname)) {
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

// Successful AI requests appear in Admin -> Activity
router.use("/ai", recordAiUse);
router.get("/ai/quota", resumeAiController.getQuota);
router.post("/ai/generate", aiLimiter, validate(generateResumeSchema), resumeController.generateWithAI);
router.post("/ai/tailor", aiLimiter, validate(tailorResumeSchema), resumeAiController.tailorResume);
router.post("/ai/write-summary", aiLimiter, validate(writeSummarySchema), resumeAiController.writeSummary);
router.post("/ai/rewrite-bullets", aiLimiter, validate(rewriteBulletsSchema), resumeAiController.rewriteBullets);
router.post("/ai/suggest-skills", aiLimiter, validate(suggestSkillsSchema), resumeAiController.suggestSkills);
router.post("/ai/grammar", aiLimiter, validate(grammarSchema), resumeAiController.grammarCheck);
router.post("/ai/improve", aiLimiter, validate(improveResumeSchema), resumeController.improveWithAI);
router.post("/ai/ats-check", aiLimiter, validate(atsCheckSchema), resumeController.checkATS);
router.post("/ai/interview/questions", aiLimiter, validate(interviewQuestionsSchema), careerAiController.interviewQuestions);
router.post("/ai/interview/feedback", aiLimiter, validate(interviewFeedbackSchema), careerAiController.interviewFeedback);
router.post("/ai/coach", aiLimiter, validate(coachChatSchema), careerAiController.coachChat);
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
router.post("/:id/apply-edits", validate(applyEditsSchema), careerAiController.applyEdits);
router.get("/:id/export-pdf", resumeController.exportPDF);
router.post("/:id/exported", resumeController.recordExport);
router.patch("/:id/sections", validate(reorderSectionsSchema), resumeController.reorderSections);
router.post("/:id/experience", validate(experienceItemSchema), resumeController.addExperience);

export default router;
