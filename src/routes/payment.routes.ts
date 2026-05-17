import { Router } from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/plans", paymentController.getPlans);
router.get("/calculate", paymentController.calculatePlanPrice);
router.post("/sslcommerz/ipn", paymentController.sslcommerzIPN);

router.use(authenticate);
router.get("/history", paymentController.getPaymentHistory);
router.post("/sslcommerz", paymentController.payWithSSLCommerz);
router.post("/bkash", paymentController.payWithBkash);
router.post("/nagad", paymentController.payWithNagad);

export default router;
