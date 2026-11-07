import type { Request } from "express";
import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import { escapeHtml, sendEmail } from "./email.service.js";
import { recordActivity } from "./activity.service.js";
import { getBoolSetting, getSetting, getSettingOrDefault } from "./settings.service.js";

// Emails to the site's admins when someone signs up, asks to buy Premium or creates a CV
// (Admin -> Settings -> Admin notifications). The announce* helpers below also record the
// event in the activity log, so each call site needs one line. Nothing here is awaited by
// the request that triggered it: a slow or broken SMTP server never delays or fails it.

const EVENT_SETTINGS = {
  newUser: "NOTIFY_NEW_USER",
  purchaseRequest: "NOTIFY_PURCHASE_REQUEST",
  cvCreated: "NOTIFY_CV_CREATED",
} as const;

export type AdminEvent = keyof typeof EVENT_SETTINGS;

interface Notice {
  subject: string;
  heading: string;
  intro?: string;
  rows: Array<[label: string, value: string | number | null | undefined]>;
  /** A button to the admin page that deals with this, e.g. /admin/bkash-payments */
  link?: { label: string; path: string };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ADMIN_NOTIFICATION_EMAILS, or every admin account's email when it is empty. */
export const notificationRecipients = async (): Promise<string[]> => {
  const value = await getSettingOrDefault("ADMIN_NOTIFICATION_EMAILS");
  return [...new Set(value.split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter((item) => EMAIL_PATTERN.test(item)))];
};

const bdTime = (date = new Date()) =>
  `${date.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })} (Bangladesh time)`;

const oneLine = (value: string, max = 150) => value.replace(/[\r\n]+/g, " ").trim().slice(0, max);

const renderNotice = (notice: Notice, siteName: string) => {
  const rows = notice.rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;word-break:break-word">${escapeHtml(String(value))}</td>
        </tr>`
    )
    .join("");
  const button = notice.link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(`${config.clientUrl}${notice.link.path}`)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none">${escapeHtml(notice.link.label)}</a></p>`
    : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(notice.heading)}</h2>
      ${notice.intro ? `<p style="margin:0 0 16px">${escapeHtml(notice.intro)}</p>` : ""}
      <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>
      ${button}
      <p style="margin-top:28px;color:#6b7280;font-size:12px">
        You get this email as an admin of ${escapeHtml(siteName)}. Change who gets it, or turn it off,
        in Admin &rarr; Settings &rarr; Admin notifications.
      </p>
    </div>`;
};

/** Emails the admins about `event` in the background, if that notification is switched on. */
export const notifyAdmins = (event: AdminEvent, notice: Notice): void => {
  const send = async () => {
    if (!(await getBoolSetting(EVENT_SETTINGS[event], true))) return;
    const recipients = await notificationRecipients();
    if (!recipients.length) return;
    const siteName = (await getSetting("SITE_NAME")) || config.app.name;
    await sendEmail(recipients.join(", "), `[${siteName}] ${oneLine(notice.subject)}`, renderNotice(notice, siteName));
  };
  void send().catch((error: Error) => console.warn(`Admin notification (${event}) failed: ${error.message}`));
};

const activityLink = (userId: string) => ({ label: "View this user's activity", path: `/admin/activity?userId=${encodeURIComponent(userId)}` });

interface UserRef {
  id: string;
  name: string;
  email: string;
}

/** A new account: logs it and emails the admins. */
export const announceNewUser = (req: Request, user: UserRef, method: "email" | "google", referred = false): void => {
  const how = method === "google" ? "Google" : "Email and password";
  recordActivity({
    userId: user.id,
    type: "user.registered",
    message: `Signed up with ${method === "google" ? "Google" : "email"}`,
    metadata: { method, referred },
    req,
  });
  notifyAdmins("newUser", {
    subject: `New user: ${user.name} (${user.email})`,
    heading: "A new user signed up",
    rows: [
      ["Name", user.name],
      ["Email", user.email],
      ["Signed up with", how],
      ["Referred by a user", referred ? "Yes" : undefined],
      ["Time", bdTime()],
    ],
    link: activityLink(user.id),
  });
};

export type CvSource = "new" | "duplicate" | "import" | "upload" | "translate";

const CV_SOURCES: Record<CvSource, { activity: (title: string) => string; label: string }> = {
  new: { activity: (title) => `Created CV "${title}"`, label: "Started a new CV" },
  duplicate: { activity: (title) => `Duplicated a CV as "${title}"`, label: "Copied an existing CV" },
  import: { activity: (title) => `Imported CV "${title}" from pasted text`, label: "Imported pasted text (AI)" },
  upload: { activity: (title) => `Uploaded CV "${title}"`, label: "Uploaded a PDF or Word file (AI)" },
  translate: { activity: (title) => `Translated a CV into "${title}"`, label: "Translated an existing CV (AI)" },
};

/** A new CV, however it was made: logs it and emails the admins. */
export const announceCvCreated = (
  req: Request,
  user: UserRef,
  resume: { id: string; title: string; language: string; templateId: string },
  source: CvSource
): void => {
  const how = CV_SOURCES[source];
  recordActivity({
    userId: user.id,
    type: "cv.created",
    message: how.activity(resume.title),
    metadata: { resumeId: resume.id, title: resume.title, source, language: resume.language, template: resume.templateId },
    req,
  });
  notifyAdmins("cvCreated", {
    subject: `New CV "${resume.title}" by ${user.name}`,
    heading: "A user created a CV",
    rows: [
      ["User", user.name],
      ["Email", user.email],
      ["CV title", resume.title],
      ["How", how.label],
      ["Language", resume.language === "bn" ? "Bangla" : "English"],
      ["Template", resume.templateId],
      ["Time", bdTime()],
    ],
    link: activityLink(user.id),
  });
};

const PROVIDERS: Record<string, string> = { sslcommerz: "SSLCommerz (card / mobile banking)", bkash: "bKash (manual)", nagad: "Nagad" };

/**
 * A new purchase request (a bKash payment to review, or a checkout started): logs it and
 * emails the admins. Looks the payment up by its transaction ID, so callers need nothing else.
 */
export const announcePurchaseRequest = (req: Request, transactionId: string): void => {
  const run = async () => {
    const payment = await prisma.payment.findUnique({
      where: { transactionId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!payment) return;
    const product = payment.productSlug
      ? await prisma.product.findUnique({ where: { slug: payment.productSlug }, select: { name: true } })
      : null;
    const plan = payment.productSlug ? null : await prisma.subscriptionPlan.findUnique({ where: { slug: payment.planSlug }, select: { name: true } });
    const passLength = payment.billingCycle ? { weekly: "7-day", monthly: "30-day", yearly: "1-year" }[payment.billingCycle] : "";
    const planName = product?.name ?? (plan ? `${plan.name} ${passLength} pass` : payment.planSlug);
    const amount = `${payment.currency} ${payment.amount.toLocaleString("en-US")}`;
    const provider = PROVIDERS[payment.provider] ?? payment.provider;
    const manual = payment.provider === "bkash";
    const sentFrom = (payment.providerData as { submittedBkashNumber?: string } | null)?.submittedBkashNumber;

    recordActivity({
      userId: payment.userId,
      type: "payment.requested",
      message: `Asked to buy ${planName} for ${amount} via ${provider}`,
      metadata: {
        paymentId: payment.id,
        transactionId: payment.transactionId,
        provider: payment.provider,
        plan: payment.planSlug,
        billingCycle: payment.billingCycle ?? undefined,
        product: payment.productSlug ?? undefined,
        amount: payment.amount,
        currency: payment.currency,
        couponCode: payment.couponCode ?? undefined,
      },
      req,
    });

    const who = payment.user?.name ?? "a deleted user";
    notifyAdmins("purchaseRequest", {
      subject: manual ? `bKash payment to review: ${amount} from ${who}` : `Premium checkout started: ${amount} by ${who}`,
      heading: manual ? "A bKash payment is waiting for your review" : "A user started a Premium checkout",
      intro: manual
        ? "Check that this transaction ID arrived in your bKash account, then approve or reject it."
        : "The gateway confirms the payment separately; this only means the checkout was opened.",
      rows: [
        ["User", payment.user?.name],
        ["Email", payment.user?.email],
        [product ? "Product" : "Plan", planName],
        ["Amount", amount],
        ["Coupon", payment.couponCode],
        ["Payment method", provider],
        ["Transaction ID", payment.transactionId],
        ["Sent from (bKash)", sentFrom],
        ["Time", bdTime(payment.createdAt)],
      ],
      link: manual
        ? { label: "Review bKash payments", path: "/admin/bkash-payments" }
        : payment.userId
          ? activityLink(payment.userId)
          : undefined,
    });
  };
  void run().catch((error: Error) => console.warn(`Purchase request announcement failed: ${error.message}`));
};

// ---------------------------------------------------------------------------------------------
// Emails to customers (Premium ending, rewards, orders). Same rules: never awaited by a request,
// failures only logged, and nothing is sent until SMTP is set up (sendEmail logs instead).
// ---------------------------------------------------------------------------------------------

interface CustomerNotice {
  subject: string;
  heading: string;
  paragraphs: string[];
  /** A button into the site, e.g. /dashboard/billing */
  link?: { label: string; path: string };
}

const renderCustomerNotice = (name: string, notice: CustomerNotice, siteName: string) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(notice.heading)}</h2>
      <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
      ${notice.paragraphs.map((text) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(text)}</p>`).join("")}
      ${
        notice.link
          ? `<p style="margin:20px 0 0"><a href="${escapeHtml(`${config.clientUrl}${notice.link.path}`)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none">${escapeHtml(notice.link.label)}</a></p>`
          : ""
      }
      <p style="margin-top:28px;color:#6b7280;font-size:12px">${escapeHtml(siteName)}</p>
    </div>`;

/** Emails one customer in the background. */
export const notifyUser = (user: { name: string; email: string }, notice: CustomerNotice): void => {
  const send = async () => {
    const siteName = (await getSetting("SITE_NAME")) || config.app.name;
    await sendEmail(user.email, oneLine(notice.subject), renderCustomerNotice(user.name, notice, siteName));
  };
  void send().catch((error: Error) => console.warn(`Customer email to ${user.email} failed: ${error.message}`));
};

/** A date as Bangladeshi users read it, e.g. "12 Nov 2026". */
export const bdDate = (date: Date) => date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" });
