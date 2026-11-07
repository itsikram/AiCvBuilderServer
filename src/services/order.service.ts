import type { Request } from "express";
import { prisma } from "../config/database.js";
import type { OrderStatus, Product } from "../generated/prisma/client.js";
import type { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { recordActivity } from "./activity.service.js";
import { notifyAdmins, notifyUser } from "./notification.service.js";

// One-time products (Admin -> Products) are bought through the normal checkout (createPendingPayment
// makes an Order). When the payment completes, credit products are delivered at once; services
// wait in Admin -> Orders for a person to do the work and mark them delivered.

const DAY_MS = 24 * 60 * 60 * 1000;

const CREDIT_WORDS: Record<Exclude<Product["kind"], "service">, (n: number) => string> = {
  pdf_credits: (n) => `${n} watermark-free PDF download${n === 1 ? "" : "s"}`,
  ai_credits: (n) => `${n} extra AI requests`,
  screening_credits: (n) => `${n} CV screening${n === 1 ? "" : "s"}`,
};

/** Adds a credit product's credits to the user. */
const grantCredits = async (userId: string, product: Product) => {
  if (product.kind === "pdf_credits") {
    await prisma.user.update({ where: { id: userId }, data: { pdfCredits: { increment: product.quantity } } });
  } else if (product.kind === "screening_credits") {
    await prisma.user.update({ where: { id: userId }, data: { screeningCredits: { increment: product.quantity } } });
  } else if (product.kind === "ai_credits") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { bonusAiRequests: true, bonusAiExpiresAt: true } });
    const stillValid = user?.bonusAiExpiresAt && user.bonusAiExpiresAt.getTime() > Date.now() ? user.bonusAiRequests : 0;
    const expires = product.validDays > 0 ? new Date(Math.max(Date.now(), user?.bonusAiExpiresAt?.getTime() ?? 0) + product.validDays * DAY_MS) : null;
    // Expired leftovers are dropped; the new pack's days start from today or the old end date
    await prisma.user.update({
      where: { id: userId },
      data: { bonusAiRequests: (user?.bonusAiExpiresAt ? stillValid : user?.bonusAiRequests ?? 0) + product.quantity, bonusAiExpiresAt: expires },
    });
  }
};

/** Delivers (credits) or queues (services) the order a completed payment paid for. Safe to call twice. */
export const fulfillOrderForPayment = async (paymentId: string) => {
  const order = await prisma.order.findFirst({ where: { paymentId }, include: { product: true, user: { select: { id: true, name: true, email: true } } } });
  if (!order || order.status !== "awaiting_payment") return;
  const service = order.product.kind === "service";
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: "awaiting_payment" },
    data: service ? { status: "paid" } : { status: "delivered", deliveredAt: new Date() },
  });
  if (!count || !order.user) return;

  const { product, user } = order;
  if (service) {
    recordActivity({
      userId: user.id,
      type: "order.paid",
      message: `Paid for "${product.name}" (${order.currency} ${order.amount}); waiting for delivery`,
      metadata: { orderId: order.id, product: product.slug },
    });
    notifyUser(user, {
      subject: `We received your order: ${product.name}`,
      heading: "Thanks, your order is confirmed",
      paragraphs: [
        `We've received your payment for "${product.name}".`,
        product.deliveryDays
          ? `We'll deliver it within ${product.deliveryDays} day${product.deliveryDays === 1 ? "" : "s"}. You'll get an email, and it will appear in My orders.`
          : "We'll email you when it's ready, and it will appear in My orders.",
      ],
      link: { label: "View my orders", path: "/dashboard/orders" },
    });
    notifyAdmins("purchaseRequest", {
      subject: `New order to deliver: ${product.name} for ${user.name}`,
      heading: "A paid service order is waiting",
      intro: product.deliveryDays ? `Promised delivery: within ${product.deliveryDays} day(s).` : undefined,
      rows: [
        ["Service", product.name],
        ["Customer", user.name],
        ["Email", user.email],
        ["Amount", `${order.currency} ${order.amount}`],
        ["Their notes", order.notes],
      ],
      link: { label: "Open orders", path: "/admin/orders" },
    });
    return;
  }

  await grantCredits(user.id, product);
  const words = CREDIT_WORDS[product.kind as keyof typeof CREDIT_WORDS](product.quantity);
  recordActivity({
    userId: user.id,
    type: "order.delivered",
    message: `Bought "${product.name}": ${words} added`,
    metadata: { orderId: order.id, product: product.slug, quantity: product.quantity },
  });
  notifyUser(user, {
    subject: `${product.name}: added to your account`,
    heading: "Your purchase is ready",
    paragraphs: [`We've added ${words} to your account.${product.validDays ? ` Use them within ${product.validDays} days.` : ""}`],
    link: { label: "Open my dashboard", path: "/dashboard" },
  });
};

/** Cancels the order of a payment that failed or was rejected. */
export const cancelOrdersForPayment = async (paymentId: string) => {
  await prisma.order.updateMany({ where: { paymentId, status: "awaiting_payment" }, data: { status: "cancelled" } });
};

const ADMIN_STATUSES: OrderStatus[] = ["in_progress", "delivered", "cancelled"];

/** An admin moves a service order along; "delivered" emails the customer the delivery message. */
export const updateOrderByAdmin = async (
  id: string,
  input: { status?: unknown; deliveryMessage?: unknown },
  adminEmail: string
) => {
  const order = await prisma.order.findUnique({ where: { id }, include: { product: true, user: { select: { id: true, name: true, email: true } } } });
  if (!order) throw new ApiError(404, "Order not found");
  const status = typeof input.status === "string" && ADMIN_STATUSES.includes(input.status as OrderStatus) ? (input.status as OrderStatus) : undefined;
  if (input.status !== undefined && !status) throw new ApiError(400, "Status must be in_progress, delivered or cancelled");
  if (status && order.status === "awaiting_payment" && status !== "cancelled") {
    throw new ApiError(409, "This order isn't paid yet. Approve its payment first.");
  }
  const deliveryMessage = typeof input.deliveryMessage === "string" ? input.deliveryMessage.trim().slice(0, 20000) : undefined;
  if (status === "delivered" && !(deliveryMessage || order.deliveryMessage)) {
    throw new ApiError(400, "Write the delivery message (or a link to the delivered files) first.");
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(deliveryMessage !== undefined && { deliveryMessage }),
      ...(status === "delivered" && { deliveredAt: new Date() }),
    },
    include: { product: true, user: { select: { id: true, name: true, email: true } } },
  });

  if (status === "delivered" && order.status !== "delivered" && updated.user) {
    recordActivity({
      userId: updated.user.id,
      type: "order.delivered",
      message: `"${updated.product.name}" delivered by ${adminEmail}`,
      metadata: { orderId: id, product: updated.product.slug },
    });
    notifyUser(updated.user, {
      subject: `Delivered: ${updated.product.name}`,
      heading: "Your order is ready",
      paragraphs: [`Here's your "${updated.product.name}":`, updated.deliveryMessage ?? ""],
      link: { label: "View my orders", path: "/dashboard/orders" },
    });
  }
  return updated;
};

/**
 * Lets a Free user download one PDF without the watermark: Premium needs nothing, otherwise one
 * PDF credit is used. The editor asks before building the PDF in the browser.
 */
export const useWatermarkFreeDownload = async (user: User, resumeId: string, premium: boolean, req?: Request) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId: user.id }, select: { id: true, title: true } });
  if (!resume) throw new ApiError(404, "Resume not found");
  if (premium) return { watermark: false, creditsLeft: user.pdfCredits, usedCredit: false };
  const { count } = await prisma.user.updateMany({ where: { id: user.id, pdfCredits: { gt: 0 } }, data: { pdfCredits: { decrement: 1 } } });
  if (!count) throw new ApiError(402, "You have no watermark-free PDF credits. Buy one, or get Premium.");
  recordActivity({
    userId: user.id,
    type: "pdf_credit.used",
    message: `Used a PDF credit for "${resume.title}"`,
    metadata: { resumeId: resume.id },
    req,
  });
  return { watermark: false, creditsLeft: user.pdfCredits - 1, usedCredit: true };
};
