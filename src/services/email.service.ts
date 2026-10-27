import nodemailer from "nodemailer";
import { config } from "../config/index.js";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const createTransporter = () => {
  if (!config.email.host || !config.email.user) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: { user: config.email.user, pass: config.email.pass },
    // Nodemailer waits 2 minutes by default, which holds the HTTP request open that long
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[Email Dev] To: ${to} | Subject: ${subject}`);
    return true;
  }
  try {
    await transporter.sendMail({ from: config.email.from, to, subject, html });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // EACCES/EPERM on connect: the host's firewall blocks outbound SMTP to that port
    const hint = err.syscall === "connect" && /EACCES|EPERM/.test(err.message)
      ? ` (outbound SMTP to ${config.email.host}:${config.email.port} is blocked by this host)`
      : "";
    console.error(`Email to ${to} failed: ${err.message}${hint}`);
    throw error;
  }
  return true;
};

export const sendVerificationEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const verifyUrl = `${config.clientUrl}/verify-email?token=${token}`;
  await sendEmail(
    email,
    `Verify your ${config.app.name} account`,
    `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ${config.app.name}, ${escapeHtml(name)}!</h2>
      <p>Please verify your email address to get started building your professional resume.</p>
      <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
        Verify Email
      </a>
      <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
    </div>
    `
  );
};

export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const resetUrl = `${config.clientUrl}/reset-password?token=${token}`;
  await sendEmail(
    email,
    `Reset your ${config.app.name} password`,
    `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset</h2>
      <p>Hi ${escapeHtml(name)}, click below to reset your password. Link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
        Reset Password
      </a>
    </div>
    `
  );
};
