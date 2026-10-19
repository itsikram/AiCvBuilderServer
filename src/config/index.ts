import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().url().optional(),
  SITE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEYS: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_FALLBACK_MODEL: z.string().optional(),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(6).optional(),
  AI_DAILY_QUOTA_FREE: z.coerce.number().int().min(0).optional(),
  AI_DAILY_QUOTA_PREMIUM: z.coerce.number().int().min(0).optional(),
  PDFTXT_API_KEY: z.string().optional().default(""),
  REDIS_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("AI CV Builder BD <noreply@aicvbuilderbd.online>"),
  SSL_STORE_ID: z.string().optional(),
  SSL_STORE_PASS: z.string().optional(),
  SSL_IS_LIVE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  SSL_SUCCESS_URL: z.string().optional(),
  SSL_FAIL_URL: z.string().optional(),
  SSL_CANCEL_URL: z.string().optional(),
  SSL_IPN_URL: z.string().optional(),
  APP_NAME: z.string().default("AI CV Builder BD"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

const stripSlash = (url: string) => url.replace(/\/+$/, "");

// Canonical public origin, e.g. https://aicvbuilderbd.online (no trailing slash)
const siteUrl = stripSlash(process.env.SITE_URL || process.env.CLIENT_URL || "http://localhost:5173");

// The apex and www variants of SITE_URL are always allowed, plus CLIENT_URL and ALLOWED_ORIGINS
const buildAllowedOrigins = (): string[] => {
  const origins = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    try {
      const url = new URL(value);
      origins.add(url.origin);
      const host = url.hostname;
      if (host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
        origins.add(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`);
      }
    } catch {
      /* ignore invalid origins */
    }
  };
  add(siteUrl);
  add(process.env.CLIENT_URL);
  (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).forEach(add);
  return [...origins];
};

export const config = {
  env: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
  port: Number(process.env.PORT) || 5000,
  // Where emails and redirects send users; defaults to the canonical site
  clientUrl: stripSlash(process.env.CLIENT_URL || siteUrl),
  siteUrl,
  allowedOrigins: buildAllowedOrigins(),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/aicvbuilderbd",
  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-me-in-production-32chars",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me-32chars",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    apiKeys: (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
      .split(",")
      .map(key => key.trim())
      .filter(key => key.length > 0),
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "",
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 30_000,
    maxRetries: process.env.GEMINI_MAX_RETRIES !== undefined ? Number(process.env.GEMINI_MAX_RETRIES) : 3,
  },
  pdftxt: {
    apiKey: process.env.PDFTXT_API_KEY || "",
  },
  redis: {
    url: process.env.REDIS_URL || "",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  email: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "AI CV Builder BD <noreply@aicvbuilderbd.online>",
  },
  sslcommerz: {
    storeId: process.env.SSL_STORE_ID || "",
    storePass: process.env.SSL_STORE_PASS || "",
    isLive: process.env.SSL_IS_LIVE === "true",
    successUrl: process.env.SSL_SUCCESS_URL || "",
    failUrl: process.env.SSL_FAIL_URL || "",
    cancelUrl: process.env.SSL_CANCEL_URL || "",
    ipnUrl: process.env.SSL_IPN_URL || "",
  },
  ai: {
    dailyQuotaFree: process.env.AI_DAILY_QUOTA_FREE !== undefined ? Number(process.env.AI_DAILY_QUOTA_FREE) : 10,
    dailyQuotaPremium: process.env.AI_DAILY_QUOTA_PREMIUM !== undefined ? Number(process.env.AI_DAILY_QUOTA_PREMIUM) : 100,
  },
  app: {
    name: process.env.APP_NAME || "AI CV Builder BD",
    url: siteUrl,
  },
};
