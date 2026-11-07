import { Router } from "express";
import * as growthController from "../controllers/growth.controller.js";

// Public job circulars (managed in Admin -> Job circulars)
const router = Router();
router.get("/", growthController.listJobs);
router.get("/:slug", growthController.getJob);

export default router;
