import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { validate } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ContactMessage } from "../models/ContactMessage.js";
import { sendEmail, escapeHtml } from "../services/email.service.js";
import { config } from "../config/index.js";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(3000),
  // Honeypot field: real visitors leave it empty
  website: z.string().max(0).optional().or(z.literal("")),
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many messages. Please try again later or email us directly." },
});

const router = Router();

router.post(
  "/",
  contactLimiter,
  validate(contactSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, message } = req.body as z.infer<typeof contactSchema>;
    await ContactMessage.create({ name, email, message, ip: req.ip });

    const to = process.env.CONTACT_EMAIL || process.env.SUPPORT_EMAIL;
    if (to) {
      sendEmail(
        to,
        `[${config.app.name}] Contact form: ${name}`,
        `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`
      ).catch((error) => console.warn("Contact email failed:", (error as Error).message));
    }

    res.status(201).json({ success: true, message: "Message received" });
  })
);

export default router;
