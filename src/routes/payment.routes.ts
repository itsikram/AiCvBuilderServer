import { Router } from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/plans", paymentController.getPlans);
router.get("/calculate", paymentController.calculatePlanPrice);
router.get("/products", paymentController.getProducts);
router.post("/sslcommerz/ipn", paymentController.sslcommerzIPN);

router.use(authenticate);
router.get("/history", paymentController.getPaymentHistory);
router.get("/trial", paymentController.getTrial);
router.post("/trial", paymentController.startFreeTrial);
router.get("/orders", paymentController.getMyOrders);
router.post("/redeem", paymentController.redeemCode);
router.post("/watermark-free", paymentController.useWatermarkFree);
router.get("/bkash/config", paymentController.getBkashConfig);
router.post("/sslcommerz", paymentController.payWithSSLCommerz);
router.post("/bkash", paymentController.payWithBkash);
router.post("/nagad", paymentController.payWithNagad);

export default router;
