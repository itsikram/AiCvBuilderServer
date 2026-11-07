import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  initiateSSLCommerzPayment,
  handleSSLCommerzIPN,
  initiateNagadPayment,
  calculatePrice,
  createPendingPayment,
  isPassCycle,
  resolvePurchase,
  type PurchaseInput,
} from "../services/payment.service.js";
import { prisma } from "../config/database.js";
import { asJson } from "../models/Resume.js";
import { serializeOrder, serializePayment, serializePaymentConfig, serializePlan, serializeProduct } from "../models/serializers.js";
import { ApiError } from "../utils/ApiError.js";
import { apiOriginOf } from "../utils/requestOrigin.js";
import { announcePurchaseRequest } from "../services/notification.service.js";
import { getTrialInfo, isPremium, startTrial } from "../services/subscription.service.js";
import { useWatermarkFreeDownload } from "../services/order.service.js";
import { redeemAccessCode } from "../services/rewards.service.js";
import { recordActivity } from "../services/activity.service.js";
import { subscriptionOf } from "../models/User.js";

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
  const { planSlug, billingCycle, couponCode } = req.query as { planSlug: string; billingCycle: string; couponCode?: string };
  if (!isPassCycle(billingCycle)) throw new ApiError(400, "billingCycle must be weekly, monthly or yearly");
  const result = await calculatePrice(planSlug, billingCycle, couponCode);
  res.json({ success: true, data: result });
});

/** What a checkout body may say: a Premium pass (planSlug + billingCycle) or a product (productSlug). */
const purchaseInput = (body: Record<string, unknown>): PurchaseInput => ({
  planSlug: typeof body.planSlug === "string" ? body.planSlug : undefined,
  billingCycle: body.billingCycle,
  couponCode: typeof body.couponCode === "string" && body.couponCode.trim() ? body.couponCode.trim() : undefined,
  productSlug: typeof body.productSlug === "string" && body.productSlug ? body.productSlug : undefined,
  orderNotes: typeof body.orderNotes === "string" ? body.orderNotes : undefined,
  resumeId: typeof body.resumeId === "string" && body.resumeId ? body.resumeId : undefined,
});

export const payWithSSLCommerz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await initiateSSLCommerzPayment(req.user!.userId, purchaseInput(req.body ?? {}), apiOriginOf(req));
  announcePurchaseRequest(req, result.transactionId);
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
  const { bkashNumber, transactionId } = (req.body ?? {}) as { bkashNumber?: string; transactionId?: string };

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

  const trxId = String(transactionId).trim();
  if (await prisma.payment.findUnique({ where: { transactionId: trxId }, select: { id: true } })) {
    throw new ApiError(409, "This transaction ID has already been submitted.");
  }

  const purchase = await resolvePurchase(req.user!.userId, purchaseInput(req.body ?? {}));
  const payment = await createPendingPayment(req.user!.userId, purchase, "bkash", trxId, {
    submittedBkashNumber: normalizedSubmitted,
    submittedAt: new Date().toISOString(),
  });

  announcePurchaseRequest(req, payment.transactionId);

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
  const result = await initiateNagadPayment(req.user!.userId, purchaseInput(req.body ?? {}));
  announcePurchaseRequest(req, result.transactionId);
  res.json({ success: true, data: result });
});

const currentUser = async (req: AuthRequest) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

/** The signed-in user's free trial: whether they can start it, or how long theirs runs. */
export const getTrial = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getTrialInfo(await currentUser(req)) });
});

/** Starts the free Premium trial (no payment details needed). */
export const startFreeTrial = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await currentUser(req);
  const trial = await startTrial(user);
  recordActivity({
    userId: user.id,
    type: "trial.started",
    message: `Started a ${trial.days}-day free Premium trial`,
    metadata: { days: trial.days, endsAt: trial.endsAt?.toISOString() },
    req,
  });
  res.json({
    success: true,
    message: `Your ${trial.days}-day free Premium trial has started.`,
    data: { trial, subscription: subscriptionOf(user) },
  });
});

export const getPaymentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({ success: true, data: payments.map(serializePayment) });
});

/** One-time products on sale (credit packs, and services an admin has switched on). */
export const getProducts = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const products = await prisma.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  res.json({ success: true, data: products.map(serializeProduct) });
});

/** The signed-in user's product orders, newest first. */
export const getMyOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ success: true, data: orders.map(serializeOrder) });
});

/** Redeems an organisation's access code for Premium days. */
export const redeemCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await currentUser(req);
  const result = await redeemAccessCode(user, req.body?.code, req);
  res.json({
    success: true,
    message: `Code accepted: ${result.days} days of Premium added (${result.label}).`,
    data: { ...result, subscription: subscriptionOf(user) },
  });
});

/** Before a watermark-free download: Premium passes, otherwise one PDF credit is used. */
export const useWatermarkFree = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await currentUser(req);
  const result = await useWatermarkFreeDownload(user, String(req.body?.resumeId ?? ""), isPremium(user), req);
  res.json({ success: true, data: result });
});
