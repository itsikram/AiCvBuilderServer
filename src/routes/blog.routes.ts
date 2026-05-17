import { Router } from "express";
import * as blogController from "../controllers/blog.controller.js";

const router = Router();
router.get("/", blogController.getPublishedBlogs);
router.get("/:slug", blogController.getBlogBySlug);

export default router;
