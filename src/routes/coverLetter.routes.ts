import { Router } from "express";
import * as coverLetterController from "../controllers/coverLetter.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { coverLetterIdParamSchema, generateCoverLetterSchema } from "../validators/coverLetter.validator.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();
router.use(authenticate);

router.get("/", coverLetterController.getCoverLetters);
router.post("/generate", aiLimiter, validate(generateCoverLetterSchema), coverLetterController.generateCoverLetter);
router.get("/:id/export-pdf", validate(coverLetterIdParamSchema, "params"), coverLetterController.exportCoverLetterPDF);
router.delete("/:id", validate(coverLetterIdParamSchema, "params"), coverLetterController.deleteCoverLetter);

export default router;
