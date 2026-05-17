import { Router } from "express";
import * as templateController from "../controllers/template.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(optionalAuth);
router.get("/", templateController.getTemplates);
router.get("/:slug", templateController.getTemplate);

export default router;
