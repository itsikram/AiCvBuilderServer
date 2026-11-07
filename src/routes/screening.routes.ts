import { Router } from "express";
import multer from "multer";
import * as screeningController from "../controllers/screening.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { screeningLimiter } from "../middleware/rateLimit.middleware.js";
import { resolveCvMimeType } from "../services/pdf-extraction.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!resolveCvMimeType(file.mimetype, file.originalname)) {
      cb(new Error("Only PDF or Word (.docx) files are supported"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
router.use(authenticate);
router.get("/", screeningController.listScreenings);
router.post("/", screeningController.createScreening);
router.get("/:id", screeningController.getScreening);
router.delete("/:id", screeningController.deleteScreening);
router.post("/:id/candidates", screeningLimiter, upload.single("file"), screeningController.scoreCandidate);

export default router;
