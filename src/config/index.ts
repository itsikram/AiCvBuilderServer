import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().url(),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEYS: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  PDFTXT_API_KEY: z.string().optional().default(""),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("ChakriCV <noreply@chakricv.com>"),
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
  APP_NAME: z.string().default("ChakriCV"),
  APP_URL: z.string().url().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const config = {
  env: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/chakricv",
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
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  pdftxt: {
    apiKey: process.env.PDFTXT_API_KEY || "",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
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
    from: process.env.EMAIL_FROM || "ChakriCV <noreply@chakricv.com>",
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
  app: {
    name: process.env.APP_NAME || "ChakriCV",
    url: process.env.APP_URL || "http://localhost:5173",
  },
};
