import { Router } from "express";
import { getAllPageContents, getPageContent } from "../controllers/admin.controller.js";

const router = Router();

// Public endpoints for fetching page content (no authentication required)
router.get("/", getAllPageContents);
router.get("/:pageId", getPageContent);

export default router;