import { prisma } from "../config/database.js";
import { DEFAULT_GEMINI_MODEL } from "../config/index.js";

// Admin-editable settings (Admin -> Settings) are read on hot paths such as every AI
// request, so they are cached in process memory for a minute. Updates through the
// admin API call invalidateSettings(), so the admin's own process sees them at once.
//
// Credentials and integration settings live here instead of .env: a value saved in
// Admin -> Settings wins, and the environment variable of the same name is only a
// fallback (so existing deployments keep working until the admin fills the form).
// Bootstrap values the server needs before it can reach the database (DB_*, JWT_*,
// PORT, SITE_URL, CORS, cookies, Redis) stay in the environment.

export type SettingType = "text" | "secret" | "number" | "boolean" | "textarea" | "url";

export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  type: SettingType;
  help?: string;
  /** Older key names whose saved values are still honoured. */
  aliases?: string[];
  /** Read from the environment when nothing is saved (defaults to true). */
  envFallback?: boolean;
}

export const SETTING_GROUPS = [
  { id: "site", title: "Site", description: "Branding and contact details" },
  { id: "limits", title: "User limits", description: "Override the plan limits (Admin -> Plans). Leave empty to use the plan value; -1 means unlimited. Daily AI quotas reset at midnight Bangladesh time." },
  { id: "ai", title: "Gemini AI", description: "Keys from https://aistudio.google.com/apikey. Requests rotate between keys and skip rate-limited ones." },
  { id: "google", title: "Google Sign-In", description: "Web client ID from Google Cloud Console. Leave empty to hide the Google button." },
  { id: "email", title: "Email (SMTP)", description: "Used for verification and password-reset emails." },
  { id: "storage", title: "Cloudinary", description: "Profile photos, blog covers and uploaded CV files." },
  { id: "payments", title: "SSLCommerz", description: "Card and mobile banking checkout." },
  { id: "pdf", title: "PDF import", description: "Optional pdftxt.dev fallback for hard-to-read PDFs." },
  { id: "features", title: "Features", description: "Enable or disable features" },
] as const;

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: "SITE_NAME", group: "site", label: "Site name", type: "text", envFallback: false },
  { key: "SITE_TAGLINE", group: "site", label: "Site tagline", type: "text", envFallback: false },
  { key: "SUPPORT_EMAIL", group: "site", label: "Support email", type: "text", envFallback: false },
  { key: "CONTACT_EMAIL", group: "site", label: "Contact email", type: "text", envFallback: false },
  { key: "COMPANY_NAME", group: "site", label: "Company name", type: "text", envFallback: false },
  { key: "COMPANY_ADDRESS", group: "site", label: "Company address", type: "text", envFallback: false },
  { key: "COMPANY_PHONE", group: "site", label: "Company phone", type: "text", envFallback: false },
  { key: "DEFAULT_CURRENCY", group: "site", label: "Default currency", type: "text", envFallback: false },
  { key: "TAX_RATE", group: "site", label: "Tax rate (%)", type: "number", envFallback: false },

  { key: "MAX_RESUMES_FREE", group: "limits", label: "Max resumes (Free)", type: "number", envFallback: false },
  { key: "MAX_AI_REQUESTS_FREE", group: "limits", label: "Max AI requests per month (Free)", type: "number", envFallback: false },
  { key: "AI_DAILY_QUOTA_FREE", group: "limits", label: "AI requests per day (Free)", type: "number" },
  { key: "MAX_RESUMES_PREMIUM", group: "limits", label: "Max resumes (Premium)", type: "number", envFallback: false },
  { key: "MAX_AI_REQUESTS_PREMIUM", group: "limits", label: "Max AI requests per month (Premium)", type: "number", envFallback: false },
  { key: "AI_DAILY_QUOTA_PREMIUM", group: "limits", label: "AI requests per day (Premium)", type: "number" },
  { key: "REFERRAL_BONUS_AMOUNT", group: "limits", label: "Referral bonus amount", type: "number", envFallback: false },

  { key: "GEMINI_API_KEYS", group: "ai", label: "Gemini API keys", type: "secret", help: "Comma-separated", aliases: ["GEMINI_API_KEY"] },
  { key: "GEMINI_MODEL", group: "ai", label: "Model", type: "text", help: `Empty uses ${DEFAULT_GEMINI_MODEL}. gemini-2.5-* models are retired` },
  { key: "GEMINI_FALLBACK_MODEL", group: "ai", label: "Fallback model", type: "text", help: `Used when the main model is retired or unavailable; ${DEFAULT_GEMINI_MODEL} is always tried last` },
  { key: "GEMINI_TIMEOUT_MS", group: "ai", label: "Request timeout (ms)", type: "number" },
  { key: "GEMINI_MAX_RETRIES", group: "ai", label: "Max retries", type: "number" },
  { key: "GEMINI_BASE_URL", group: "ai", label: "Gateway base URL", type: "url", help: "Leave empty for Google's endpoint" },

  { key: "GOOGLE_CLIENT_ID", group: "google", label: "Google client ID", type: "text" },

  { key: "SMTP_HOST", group: "email", label: "SMTP host", type: "text" },
  { key: "SMTP_PORT", group: "email", label: "SMTP port", type: "number", help: "587 (STARTTLS) or 465 (SSL)" },
  { key: "SMTP_USER", group: "email", label: "SMTP username", type: "text" },
  { key: "SMTP_PASS", group: "email", label: "SMTP password", type: "secret" },
  { key: "EMAIL_FROM", group: "email", label: "From address", type: "text", help: "e.g. AI CV Builder BD <noreply@aicvbuilderbd.online>" },

  { key: "CLOUDINARY_CLOUD_NAME", group: "storage", label: "Cloud name", type: "text" },
  { key: "CLOUDINARY_API_KEY", group: "storage", label: "API key", type: "text" },
  { key: "CLOUDINARY_API_SECRET", group: "storage", label: "API secret", type: "secret" },

  { key: "SSL_STORE_ID", group: "payments", label: "Store ID", type: "text", aliases: ["SSL_COMMERZ_STORE_ID"] },
  { key: "SSL_STORE_PASS", group: "payments", label: "Store password", type: "secret", aliases: ["SSL_COMMERZ_STORE_PASSWD"] },
  { key: "SSL_IS_LIVE", group: "payments", label: "Live mode", type: "boolean", help: "Off uses the SSLCommerz sandbox" },
  { key: "SSL_SUCCESS_URL", group: "payments", label: "Success URL", type: "url" },
  { key: "SSL_FAIL_URL", group: "payments", label: "Fail URL", type: "url" },
  { key: "SSL_CANCEL_URL", group: "payments", label: "Cancel URL", type: "url" },
  { key: "SSL_IPN_URL", group: "payments", label: "IPN URL", type: "url" },

  { key: "PDFTXT_API_KEY", group: "pdf", label: "pdftxt.dev API key", type: "secret" },

  { key: "MAINTENANCE_MODE", group: "features", label: "Maintenance mode", type: "boolean", envFallback: false },
  { key: "REGISTRATION_ENABLED", group: "features", label: "Registration enabled", type: "boolean", envFallback: false },
];

const definitionsByKey = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

export const settingDefinition = (key: string) => definitionsByKey.get(key);

const CACHE_MS = 60_000;
let cache: { loadedAt: number; values: Map<string, string> } | null = null;
let loading: Promise<Map<string, string>> | null = null;

const load = async (): Promise<Map<string, string>> => {
  const rows = await prisma.adminSetting.findMany({ select: { key: true, value: true } });
  return new Map(rows.map((row) => [row.key, row.value]));
};

const values = async (): Promise<Map<string, string>> => {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.values;
  if (!loading) {
    loading = load()
      .then((map) => {
        cache = { loadedAt: Date.now(), values: map };
        return map;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

export const invalidateSettings = () => {
  cache = null;
};

const nonBlank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** The value saved in Admin -> Settings (or under one of its old names), if any. */
const savedValue = async (key: string): Promise<string | undefined> => {
  try {
    const map = await values();
    for (const name of [key, ...(definitionsByKey.get(key)?.aliases ?? [])]) {
      const value = nonBlank(map.get(name));
      if (value) return value;
    }
  } catch (error) {
    console.warn(`Could not read admin settings: ${(error as Error).message}`);
  }
  return undefined;
};

const envValue = (key: string): string | undefined => {
  const definition = definitionsByKey.get(key);
  if (definition?.envFallback === false) return undefined;
  for (const name of [key, ...(definition?.aliases ?? [])]) {
    const value = nonBlank(process.env[name]);
    if (value) return value;
  }
  return undefined;
};

/** Where a setting's current value comes from: the admin panel, the environment, or nowhere. */
export const settingSource = async (key: string): Promise<"database" | "env" | "none"> =>
  (await savedValue(key)) ? "database" : envValue(key) ? "env" : "none";

/** The admin-set value, else the environment variable, else undefined. */
export const getSetting = async (key: string): Promise<string | undefined> =>
  (await savedValue(key)) ?? envValue(key);

/** An admin-set whole number (>= -1, where -1 means unlimited), else `fallback`. */
export const getIntSetting = async (key: string, fallback: number): Promise<number> => {
  const raw = await getSetting(key);
  if (raw === undefined || !/^-?\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= -1 ? value : fallback;
};

export const getBoolSetting = async (key: string, fallback = false): Promise<boolean> => {
  const raw = (await getSetting(key))?.toLowerCase();
  if (raw === undefined) return fallback;
  return ["true", "1", "yes", "on"].includes(raw);
};

export const getListSetting = async (key: string): Promise<string[]> =>
  ((await getSetting(key)) ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** Credentials and integration settings, resolved from Admin -> Settings with env fallback. */
export const integrations = {
  gemini: async () => ({
    apiKeys: await getListSetting("GEMINI_API_KEYS"),
    model: (await getSetting("GEMINI_MODEL")) || DEFAULT_GEMINI_MODEL,
    fallbackModel: (await getSetting("GEMINI_FALLBACK_MODEL")) || "",
    baseUrl: (await getSetting("GEMINI_BASE_URL")) || "",
    timeoutMs: Math.min(120_000, Math.max(1000, await getIntSetting("GEMINI_TIMEOUT_MS", 30_000))),
    maxRetries: Math.min(6, Math.max(0, await getIntSetting("GEMINI_MAX_RETRIES", 3))),
  }),
  google: async () => ({
    clientId: (await getSetting("GOOGLE_CLIENT_ID")) || "",
  }),
  email: async () => ({
    host: (await getSetting("SMTP_HOST")) || "",
    port: await getIntSetting("SMTP_PORT", 587),
    user: (await getSetting("SMTP_USER")) || "",
    pass: (await getSetting("SMTP_PASS")) || "",
    from: (await getSetting("EMAIL_FROM")) || "AI CV Builder BD <noreply@aicvbuilderbd.online>",
  }),
  cloudinary: async () => ({
    cloudName: (await getSetting("CLOUDINARY_CLOUD_NAME")) || "",
    apiKey: (await getSetting("CLOUDINARY_API_KEY")) || "",
    apiSecret: (await getSetting("CLOUDINARY_API_SECRET")) || "",
  }),
  sslcommerz: async () => ({
    storeId: (await getSetting("SSL_STORE_ID")) || "",
    storePass: (await getSetting("SSL_STORE_PASS")) || "",
    isLive: await getBoolSetting("SSL_IS_LIVE"),
    successUrl: (await getSetting("SSL_SUCCESS_URL")) || "",
    failUrl: (await getSetting("SSL_FAIL_URL")) || "",
    cancelUrl: (await getSetting("SSL_CANCEL_URL")) || "",
    ipnUrl: (await getSetting("SSL_IPN_URL")) || "",
  }),
  pdftxt: async () => ({
    apiKey: (await getSetting("PDFTXT_API_KEY")) || "",
  }),
};
