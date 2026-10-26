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
import { prisma } from "../config/database.js";
import { asJson } from "../models/Resume.js";
import { serializePayment, serializePaymentConfig, serializePlan } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";

const normalizeBkashNumber = (value?: string | null) =>
  (value || "").trim().replace(/\s+/g, "").replace(/^\+?880/, "0");

/** The bKash number currently shown on the Billing page */
export const findActiveBkashConfig = () =>
  prisma.paymentConfig.findFirst({ where: { provider: "bkash", isActive: true }, orderBy: { updatedAt: "desc" } });

export const getPlans = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  res.json({ success: true, data: plans.map(serializePlan) });
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

export const getBkashConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: serializePaymentConfig(await findActiveBkashConfig()) });
});

export const payWithBkash = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle, couponCode, bkashNumber, transactionId } = req.body as {
    planSlug: string;
    billingCycle: "monthly" | "yearly";
    couponCode?: string;
    bkashNumber: string;
    transactionId: string;
  };

  if (!bkashNumber || !transactionId) {
    throw new ApiError(400, "Please provide the BKash number and transaction ID");
  }

  const config = await findActiveBkashConfig();
  if (!config) {
    throw new ApiError(503, "BKash number is not configured by admin yet");
  }

  const normalizedSubmitted = normalizeBkashNumber(bkashNumber);
  const normalizedConfigured = normalizeBkashNumber(config.number);

  if (normalizedSubmitted !== normalizedConfigured) {
    throw new ApiError(400, "Please send the payment to the BKash number shown on the Billing page");
  }

  const { amount } = await calculatePrice(planSlug, billingCycle, couponCode);

  const payment = await prisma.payment.create({
    data: {
      userId: req.user!.userId,
      planSlug,
      billingCycle,
      amount,
      currency: "BDT",
      provider: "bkash",
      status: "pending",
      transactionId: String(transactionId).trim(),
      providerData: asJson({
        submittedBkashNumber: normalizedSubmitted,
        submittedAt: new Date().toISOString(),
      }),
      couponCode,
      discountAmount: 0,
    },
  });

  res.json({
    success: true,
    data: {
      message: "Your BKash payment has been submitted for admin review.",
      paymentId: payment.id,
      transactionId: payment.transactionId,
      amount: payment.amount,
      status: payment.status,
    },
  });
});

export const payWithNagad = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { planSlug, billingCycle } = req.body;
  const result = await initiateNagadPayment(req.user!.userId, planSlug, billingCycle);
  res.json({ success: true, data: result });
});

export const getPaymentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({ success: true, data: payments.map(serializePayment) });
});
