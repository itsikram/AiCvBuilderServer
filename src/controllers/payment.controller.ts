import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  initiateSSLCommerzPayment,
  handleSSLCommerzIPN,
  initiateBkashPayment,
  initiateNagadPayment,
  calculatePrice,
} from "../services/payment.service.js";
import { Payment } from "../models/Payment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";

export const getPlans = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 });
  res.json({ success: true, data: plans });
});

export const calculatePlanPrice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle, couponCode } = req.query as {
    planSlug: string;
    billingCycle: "monthly" | "yearly";
    couponCode?: string;
  };
  const result = await calculatePrice(planSlug, billingCycle, couponCode);
  res.json({ success: true, data: result });
});

export const payWithSSLCommerz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle, couponCode } = req.body;
  const result = await initiateSSLCommerzPayment(
    req.user!.userId,
    planSlug,
    billingCycle,
    couponCode
  );
  res.json({ success: true, data: result });
});

export const sslcommerzIPN = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await handleSSLCommerzIPN(req.body);
  res.json(result);
});

export const payWithBkash = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle } = req.body;
  const result = await initiateBkashPayment(req.user!.userId, planSlug, billingCycle);
  res.json({ success: true, data: result });
});

export const payWithNagad = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle } = req.body;
  const result = await initiateNagadPayment(req.user!.userId, planSlug, billingCycle);
  res.json({ success: true, data: result });
});

export const getPaymentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payments = await Payment.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).limit(20);
  res.json({ success: true, data: payments });
});
