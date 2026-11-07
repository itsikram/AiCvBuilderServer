import SSLCommerzPayment from "sslcommerz-lts";
import { v4 as uuidv4 } from "uuid";
import { integrations } from "./settings.service.js";
import { prisma } from "../config/database.js";
import { asJson } from "../models/Resume.js";
import { activatePremium, PASS_DAYS, type PassCycle } from "./subscription.service.js";
import { incrementMetrics } from "./analytics.service.js";
import { ApiError } from "../utils/ApiError.js";
import { recordPaymentOutcome } from "./activity.service.js";
import { cancelOrdersForPayment, fulfillOrderForPayment } from "./order.service.js";
import type { PaymentProvider, Product } from "../generated/prisma/client.js";

export const isPassCycle = (value: unknown): value is PassCycle => typeof value === "string" && Object.hasOwn(PASS_DAYS, value);

/** The price of a Premium pass (7-day, 30-day or 1-year), after a coupon if one applies. */
export const calculatePrice = async (
  planSlug: string,
  billingCycle: PassCycle,
  couponCode?: string
): Promise<{ amount: number; discount: number; plan: { name: string } }> => {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug, isActive: true } });
  if (!plan) throw new ApiError(404, "Plan not found");
  if (!isPassCycle(billingCycle)) throw new ApiError(400, "Choose a 7-day, 30-day or 1-year pass");

  let amount = billingCycle === "yearly" ? plan.priceYearly : billingCycle === "weekly" ? plan.priceWeekly : plan.priceMonthly;
  if (billingCycle === "weekly" && !(amount > 0)) throw new ApiError(400, "The 7-day pass isn't available right now");
  let discount = 0;

  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: { code: couponCode.toUpperCase(), isActive: true, validUntil: { gte: new Date() } },
    });
    if (coupon && coupon.usedCount < coupon.maxUses) {
      const applicablePlans = (coupon.applicablePlans ?? []) as string[];
      if (!applicablePlans.length || applicablePlans.includes(planSlug)) {
        discount =
          coupon.discountType === "percentage"
            ? (amount * coupon.discountValue) / 100
            : coupon.discountValue;
        amount = Math.max(0, amount - discount);
      }
    }
  }

  return { amount, discount, plan: { name: plan.name } };
};

export interface PurchaseInput {
  planSlug?: string;
  billingCycle?: unknown;
  couponCode?: string;
  /** Buy a one-time product instead of a Premium pass */
  productSlug?: string;
  /** For services: what the customer wants, and which CV it is about */
  orderNotes?: string;
  resumeId?: string;
}

/** What a checkout is for: a Premium pass or a one-time product, with its price. */
export interface Purchase {
  label: string;
  amount: number;
  discount: number;
  planSlug: string;
  billingCycle: PassCycle | null;
  couponCode?: string;
  product?: Product;
  orderNotes?: string;
  resumeId?: string;
}

export const resolvePurchase = async (userId: string, input: PurchaseInput): Promise<Purchase> => {
  if (input.productSlug) {
    const product = await prisma.product.findFirst({ where: { slug: String(input.productSlug), isActive: true } });
    if (!product) throw new ApiError(404, "That product isn't available.");
    const notes = typeof input.orderNotes === "string" ? input.orderNotes.trim().slice(0, 4000) : "";
    let resumeId: string | undefined;
    if (input.resumeId) {
      const resume = await prisma.resume.findFirst({ where: { id: String(input.resumeId), userId }, select: { id: true } });
      if (!resume) throw new ApiError(404, "CV not found");
      resumeId = resume.id;
    }
    if (product.kind === "service" && !notes && !resumeId) {
      throw new ApiError(400, "Tell us what you need, or pick the CV this is about.");
    }
    return { label: product.name, amount: product.price, discount: 0, planSlug: product.slug, billingCycle: null, product, orderNotes: notes || undefined, resumeId };
  }
  const planSlug = String(input.planSlug || "premium");
  const billingCycle = isPassCycle(input.billingCycle) ? input.billingCycle : "monthly";
  const { amount, discount, plan } = await calculatePrice(planSlug, billingCycle, input.couponCode);
  const length = { weekly: "7-day", monthly: "30-day", yearly: "1-year" }[billingCycle];
  return { label: `${plan.name} ${length} pass`, amount, discount, planSlug, billingCycle, couponCode: input.couponCode || undefined };
};

/** Records a pending payment (and, for a product, its order awaiting payment). */
export const createPendingPayment = async (
  userId: string,
  purchase: Purchase,
  provider: PaymentProvider,
  transactionId: string,
  providerData?: Record<string, unknown>
) => {
  const payment = await prisma.payment.create({
    data: {
      userId,
      planSlug: purchase.planSlug,
      billingCycle: purchase.billingCycle,
      productSlug: purchase.product?.slug ?? null,
      amount: purchase.amount,
      currency: "BDT",
      provider,
      status: "pending",
      transactionId,
      providerData: providerData ? asJson(providerData) : undefined,
      couponCode: purchase.couponCode,
      discountAmount: purchase.discount,
    },
  });
  if (purchase.product) {
    await prisma.order.create({
      data: {
        userId,
        productId: purchase.product.id,
        paymentId: payment.id,
        amount: purchase.amount,
        currency: purchase.product.currency,
        notes: purchase.orderNotes,
        resumeId: purchase.resumeId,
      },
    });
  }
  return payment;
};

type PaymentRow = {
  id: string;
  userId: string | null;
  billingCycle: PassCycle | null;
  productSlug: string | null;
  couponCode: string | null;
  amount: number;
};

/** Gives what a now-completed payment bought (a pass or a product), counts the coupon and the revenue. */
export const completePayment = async (payment: PaymentRow) => {
  if (payment.productSlug) {
    await fulfillOrderForPayment(payment.id);
    await incrementMetrics({ revenue: payment.amount });
    return;
  }
  const user = payment.userId ? await prisma.user.findUnique({ where: { id: payment.userId } }) : null;
  if (user) {
    await activatePremium(user, payment.billingCycle ?? "monthly");
  }

  if (payment.couponCode) {
    await prisma.coupon.updateMany({ where: { code: payment.couponCode }, data: { usedCount: { increment: 1 } } });
  }

  await incrementMetrics({ revenue: payment.amount, premiumConversions: 1 });
};

/** A payment that failed or was rejected: its order (if any) is cancelled. */
export const failPayment = async (payment: { id: string }) => {
  await cancelOrdersForPayment(payment.id);
};

export const initiateSSLCommerzPayment = async (
  userId: string,
  input: PurchaseInput,
  /** This API's public origin, which completes the default IPN URL */
  apiOrigin?: string
) => {
  const ssl = await integrations.sslcommerz({ apiOrigin });
  if (!ssl.storeId || !ssl.storePass) {
    throw new ApiError(503, "Payment gateway not configured");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User not found");

  const purchase = await resolvePurchase(userId, input);
  const transactionId = `CHK-${uuidv4().slice(0, 12).toUpperCase()}`;
  await createPendingPayment(userId, purchase, "sslcommerz", transactionId);

  const sslcz = new SSLCommerzPayment(ssl.storeId, ssl.storePass, ssl.isLive);

  const paymentData = {
    total_amount: purchase.amount,
    currency: "BDT",
    tran_id: transactionId,
    success_url: ssl.successUrl,
    fail_url: ssl.failUrl,
    cancel_url: ssl.cancelUrl,
    ipn_url: ssl.ipnUrl,
    shipping_method: "NO",
    product_name: `AI CV Builder BD: ${purchase.label}`,
    product_category: purchase.product ? "Digital service" : "Subscription",
    product_profile: "non-physical-goods",
    cus_name: user.name,
    cus_email: user.email,
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: "01700000000",
  };

  const apiResponse = await sslcz.init(paymentData);
  if (!apiResponse?.GatewayPageURL) {
    throw new ApiError(502, "Failed to initiate payment");
  }

  return { gatewayUrl: apiResponse.GatewayPageURL, transactionId };
};

export const handleSSLCommerzIPN = async (body: Record<string, string>) => {
  const { tran_id, status, val_id, amount } = body;
  const payment = tran_id ? await prisma.payment.findUnique({ where: { transactionId: String(tran_id) } }) : null;
  if (!payment) throw new ApiError(404, "Payment not found");

  if (payment.status === "completed") return { message: "Already processed" };

  if (status === "VALID" || status === "VALIDATED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "completed", providerData: asJson({ val_id, amount, ...body }) },
    });
    await completePayment(payment);
    recordPaymentOutcome(payment, true, "confirmed by SSLCommerz");
    return { message: "Payment successful" };
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  await failPayment(payment);
  recordPaymentOutcome(payment, false, `failed at SSLCommerz (${status || "no status"})`, { gatewayStatus: status });
  return { message: "Payment failed" };
};

export const initiateNagadPayment = async (userId: string, input: PurchaseInput) => {
  const purchase = await resolvePurchase(userId, input);
  const transactionId = `NG-${uuidv4().slice(0, 12).toUpperCase()}`;
  await createPendingPayment(userId, purchase, "nagad", transactionId);

  return {
    transactionId,
    message: "Nagad integration ready. Configure NAGAD_* env variables and implement checkout APIs.",
  };
};
