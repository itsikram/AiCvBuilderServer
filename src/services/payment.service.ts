import SSLCommerzPayment from "sslcommerz-lts";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/index.js";
import { Payment } from "../models/Payment.js";
import { Coupon } from "../models/Coupon.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { User } from "../models/User.js";
import { activatePremium } from "./subscription.service.js";
import { ApiError } from "../utils/ApiError.js";
import { Analytics } from "../models/Analytics.js";

export const calculatePrice = async (
  planSlug: string,
  billingCycle: "monthly" | "yearly",
  couponCode?: string
): Promise<{ amount: number; discount: number; plan: { name: string } }> => {
  const plan = await SubscriptionPlan.findOne({ slug: planSlug, isActive: true });
  if (!plan) throw new ApiError(404, "Plan not found");

  let amount = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
  let discount = 0;

  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validUntil: { $gte: new Date() },
    });
    if (coupon && coupon.usedCount < coupon.maxUses) {
      if (
        !coupon.applicablePlans.length ||
        coupon.applicablePlans.includes(planSlug)
      ) {
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

export const initiateSSLCommerzPayment = async (
  userId: string,
  planSlug: string,
  billingCycle: "monthly" | "yearly",
  couponCode?: string
) => {
  if (!config.sslcommerz.storeId || !config.sslcommerz.storePass) {
    throw new ApiError(503, "Payment gateway not configured");
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const { amount, discount } = await calculatePrice(planSlug, billingCycle, couponCode);
  const transactionId = `CHK-${uuidv4().slice(0, 12).toUpperCase()}`;

  await Payment.create({
    userId,
    planSlug,
    billingCycle,
    amount,
    currency: "BDT",
    provider: "sslcommerz",
    status: "pending",
    transactionId,
    couponCode,
    discountAmount: discount,
  });

  const sslcz = new SSLCommerzPayment(
    config.sslcommerz.storeId,
    config.sslcommerz.storePass,
    config.sslcommerz.isLive
  );

  const paymentData = {
    total_amount: amount,
    currency: "BDT",
    tran_id: transactionId,
    success_url: config.sslcommerz.successUrl,
    fail_url: config.sslcommerz.failUrl,
    cancel_url: config.sslcommerz.cancelUrl,
    ipn_url: config.sslcommerz.ipnUrl,
    shipping_method: "NO",
    product_name: `ChakriCV Premium (${billingCycle})`,
    product_category: "Subscription",
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
  const payment = await Payment.findOne({ transactionId: tran_id });
  if (!payment) throw new ApiError(404, "Payment not found");

  if (payment.status === "completed") return { message: "Already processed" };

  if (status === "VALID" || status === "VALIDATED") {
    payment.status = "completed";
    payment.providerData = { val_id, amount, ...body };
    await payment.save();

    const user = await User.findById(payment.userId);
    if (user) {
      await activatePremium(user, payment.billingCycle);
    }

    if (payment.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: payment.couponCode },
        { $inc: { usedCount: 1 } }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await Analytics.findOneAndUpdate(
      { date: today },
      {
        $inc: {
          "metrics.revenue": payment.amount,
          "metrics.premiumConversions": 1,
        },
      },
      { upsert: true }
    );

    return { message: "Payment successful" };
  }

  payment.status = "failed";
  await payment.save();
  return { message: "Payment failed" };
};

export const initiateBkashPayment = async (
  userId: string,
  planSlug: string,
  billingCycle: "monthly" | "yearly"
) => {
  const { amount } = await calculatePrice(planSlug, billingCycle);
  const transactionId = `BK-${uuidv4().slice(0, 12).toUpperCase()}`;

  await Payment.create({
    userId,
    planSlug,
    billingCycle,
    amount,
    currency: "BDT",
    provider: "bkash",
    status: "pending",
    transactionId,
  });

  return {
    transactionId,
    message: "bKash integration ready. Configure BKASH_* env variables and implement token/grant APIs.",
    sandboxUrl: process.env.BKASH_IS_SANDBOX === "true"
      ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
      : "https://tokenized.pay.bka.sh/v1.2.0-beta",
  };
};

export const initiateNagadPayment = async (
  userId: string,
  planSlug: string,
  billingCycle: "monthly" | "yearly"
) => {
  const { amount } = await calculatePrice(planSlug, billingCycle);
  const transactionId = `NG-${uuidv4().slice(0, 12).toUpperCase()}`;

  await Payment.create({
    userId,
    planSlug,
    billingCycle,
    amount,
    currency: "BDT",
    provider: "nagad",
    status: "pending",
    transactionId,
  });

  return {
    transactionId,
    message: "Nagad integration ready. Configure NAGAD_* env variables and implement checkout APIs.",
  };
};
