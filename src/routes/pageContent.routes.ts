import { Router } from "express";
import { getPublicPageContents, getPageContent } from "../controllers/admin.controller.js";

const router = Router();

// Public endpoints for fetching page content (no authentication required); active entries only.
// The admin content manager lists drafts too, through /admin/page-content.
router.get("/", getPublicPageContents);
router.get("/:pageId", getPageContent);

export default router;
