import { JWT } from "google-auth-library";
import { prisma } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { getSetting } from "./settings.service.js";
import { defaultSearchConsoleProperty } from "./searchConsoleProperty.js";

// Google Search Console data for Admin -> SEO & keywords: the searches that show the site on
// Google, its clicks, impressions, click-through rate (CTR) and average position. It reads
// with a service account: the admin pastes its JSON key in Admin -> Settings -> Google Search
// Console and adds the service account's email as a user of the Search Console property.
// Read-only scope; results are cached for 30 minutes.

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://searchconsole.googleapis.com/webmasters/v3";
const CACHE_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Search Console keeps 16 months of data */
const MAX_HISTORY_DAYS = 480;

export const SEO_RANGES = { "7d": 7, "28d": 28, "90d": 90, "365d": 365 } as const;
export type SeoRange = keyof typeof SEO_RANGES;
export const isSeoRange = (value: unknown): value is SeoRange => typeof value === "string" && Object.hasOwn(SEO_RANGES, value);
export const SEO_DEVICES = ["all", "mobile", "desktop", "tablet"] as const;
export type SeoDevice = (typeof SEO_DEVICES)[number];


export const searchConsoleProperty = async () => (await getSetting("SEARCH_CONSOLE_PROPERTY"))?.trim() || defaultSearchConsoleProperty();

let client: { raw: string; email: string; jwt: JWT } | null = null;

/** The authorised client for the saved JSON key, or null when no key is saved. */
const getClient = async () => {
  const raw = (await getSetting("SEARCH_CONSOLE_CREDENTIALS"))?.trim();
  if (!raw) return null;
  if (client?.raw === raw) return client;
  let key: { client_email?: unknown; private_key?: unknown };
  try {
    key = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "The Search Console key isn't valid JSON. Paste the whole JSON key file of the service account.");
  }
  if (typeof key.client_email !== "string" || typeof key.private_key !== "string") {
    throw new ApiError(400, "The JSON key has no client_email or private_key. Download a new JSON key for the service account.");
  }
  client = { raw, email: key.client_email, jwt: new JWT({ email: key.client_email, key: key.private_key, scopes: [SCOPE] }) };
  return client;
};

export const isSearchConsoleConnected = async () => Boolean((await getSetting("SEARCH_CONSOLE_CREDENTIALS"))?.trim());

/** Google's error, in words an admin can act on. */
const explain = (error: unknown, email: string, property: string): ApiError => {
  const err = error as { response?: { status?: number; data?: { error?: { message?: string } | string; error_description?: string } }; message?: string };
  const status = err.response?.status;
  const data = err.response?.data;
  const detail = (typeof data?.error === "object" ? data.error.message : data?.error_description) || err.message || "Unknown error";
  if (status === 403) {
    return new ApiError(
      502,
      `Google refused access to ${property}. In Search Console, open Settings -> Users and permissions and add ${email} as a user (Restricted is enough). Google said: ${detail}`
    );
  }
  if (status === 404) return new ApiError(502, `Search Console has no property called ${property}. Check the property in Admin -> Settings.`);
  if (/invalid_grant|invalid_client|PEM|DECODER|private key/i.test(detail)) {
    return new ApiError(502, `Google rejected the service account key (${detail}). Create a new JSON key and paste it again.`);
  }
  if (status === 429) return new ApiError(503, "Search Console's request limit was reached. Try again in a minute.");
  return new ApiError(502, `Search Console request failed${status ? ` (${status})` : ""}: ${detail}`);
};

const call = async <T>(path: string, data?: object): Promise<T> => {
  const connection = await getClient();
  if (!connection) throw new ApiError(409, "Google Search Console isn't connected yet (Admin -> Settings -> Google Search Console).");
  const property = await searchConsoleProperty();
  try {
    const response = await connection.jwt.request<T>({ url: `${API}${path}`, method: data ? "POST" : "GET", data, timeout: 25_000 });
    return response.data;
  } catch (error) {
    throw explain(error, connection.email, property);
  }
};

interface ApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Metrics {
  clicks: number;
  impressions: number;
  /** 0-1 */
  ctr: number;
  /** 1 = top of the first page; null when there were no impressions */
  position: number | null;
}

const metricsOf = (row?: ApiRow): Metrics => ({
  clicks: row?.clicks ?? 0,
  impressions: row?.impressions ?? 0,
  ctr: row?.impressions ? row.clicks / row.impressions : 0,
  position: row?.impressions ? Math.round(row.position * 10) / 10 : null,
});

/** Dates as Search Console expects them (YYYY-MM-DD, the property's time zone: Pacific time). */
const day = (date: Date) => date.toISOString().slice(0, 10);

const windowFor = (days: number, now = new Date()) => {
  // The last two days are still incomplete in Search Console
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 2 * DAY_MS);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const hasPrevious = days * 2 <= MAX_HISTORY_DAYS;
  return {
    current: { startDate: day(start), endDate: day(end) },
    previous: hasPrevious ? { startDate: day(new Date(start.getTime() - days * DAY_MS)), endDate: day(new Date(start.getTime() - DAY_MS)) } : null,
    dates: Array.from({ length: days }, (_, i) => day(new Date(start.getTime() + i * DAY_MS))),
  };
};

/**
 * Typical click-through rate by position on Google, a rough benchmark used to flag
 * listings that get fewer clicks than their position should bring.
 */
const EXPECTED_CTR = [0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.026, 0.022];
export const expectedCtr = (position: number) => EXPECTED_CTR[Math.min(EXPECTED_CTR.length - 1, Math.max(0, Math.round(position) - 1))];

const BANGLA_SCRIPT = /[ঀ-৿]/;
const normalizeQuery = (query: string) => query.toLowerCase().replace(/\s+/g, " ").trim();
const pathOf = (url: string) => {
  try {
    const { pathname } = new URL(url);
    return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  } catch {
    return url;
  }
};

interface Filters {
  country: "bgd" | "all";
  device: SeoDevice;
}

const cache = new Map<string, { at: number; data: Awaited<ReturnType<typeof fetchRaw>> }>();

/** Everything the report needs from Google, fetched in parallel. */
const fetchRaw = async (property: string, days: number, filters: Filters) => {
  const window = windowFor(days);
  const filterList = [
    ...(filters.country === "bgd" ? [{ dimension: "country", operator: "equals", expression: "bgd" }] : []),
    ...(filters.device !== "all" ? [{ dimension: "device", operator: "equals", expression: filters.device.toUpperCase() }] : []),
  ];
  const base = { type: "web", dataState: "all", ...(filterList.length && { dimensionFilterGroups: [{ filters: filterList }] }) };
  const path = `/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const query = async (range: { startDate: string; endDate: string }, dimensions: string[], rowLimit: number, extra: object = {}) =>
    (await call<{ rows?: ApiRow[] }>(path, { ...base, ...range, dimensions, rowLimit, ...extra })).rows ?? [];

  const [totals, previousTotals, byDate, queries, previousQueries, pages, queryPages, devices, countries] = await Promise.all([
    query(window.current, [], 1),
    window.previous ? query(window.previous, [], 1) : Promise.resolve(null),
    query(window.current, ["date"], 500),
    query(window.current, ["query"], 5000),
    window.previous ? query(window.previous, ["query"], 5000) : Promise.resolve(null),
    query(window.current, ["page"], 100),
    query(window.current, ["query", "page"], 5000),
    query(window.current, ["device"], 10),
    // Countries are always shown for the whole world, to see Bangladesh's share
    (async () =>
      (
        await call<{ rows?: ApiRow[] }>(path, {
          type: "web",
          dataState: "all",
          ...window.current,
          dimensions: ["country"],
          rowLimit: 8,
          ...(filters.device !== "all" && {
            dimensionFilterGroups: [{ filters: [{ dimension: "device", operator: "equals", expression: filters.device.toUpperCase() }] }],
          }),
        })
      ).rows ?? [])(),
  ]);
  return { window, totals, previousTotals, byDate, queries, previousQueries, pages, queryPages, devices, countries };
};

export interface TrackedKeyword {
  id: string;
  keyword: string;
  language: "en" | "bn";
  targetPath: string | null;
  notes: string | null;
}

const OPPORTUNITY_LIMIT = 25;

/** The SEO report: totals, trend, queries, pages, opportunities and the tracked keywords. */
export const getSearchReport = async (range: SeoRange, filters: Filters, keywords: TrackedKeyword[], refresh = false) => {
  const property = await searchConsoleProperty();
  const connection = await getClient();
  if (!connection) throw new ApiError(409, "Google Search Console isn't connected yet.");
  const days = SEO_RANGES[range];
  const cacheKey = JSON.stringify([connection.email, property, days, filters]);
  const cached = cache.get(cacheKey);
  let raw: Awaited<ReturnType<typeof fetchRaw>>;
  let fetchedAt: number;
  if (!refresh && cached && Date.now() - cached.at < CACHE_MS) {
    raw = cached.data;
    fetchedAt = cached.at;
  } else {
    raw = await fetchRaw(property, days, filters);
    fetchedAt = Date.now();
    cache.set(cacheKey, { at: fetchedAt, data: raw });
  }

  const previousByQuery = raw.previousQueries ? new Map(raw.previousQueries.map((row) => [normalizeQuery(row.keys?.[0] ?? ""), row])) : null;
  const queries = raw.queries.map((row) => {
    const query = row.keys?.[0] ?? "";
    const previous = previousByQuery?.get(normalizeQuery(query));
    const metrics = metricsOf(row);
    return {
      query,
      ...metrics,
      previousPosition: previousByQuery ? metricsOf(previous).position : undefined,
      bangla: BANGLA_SCRIPT.test(query),
    };
  });

  const byClicks = [...queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const byImpressions = (list: typeof queries) => [...list].sort((a, b) => b.impressions - a.impressions).slice(0, OPPORTUNITY_LIMIT);
  const opportunities = {
    // Positions 8-20: on the edge of page one, where a better page or more internal links pay off fastest
    almostPageOne: byImpressions(queries.filter((q) => q.position !== null && q.position > 7.5 && q.position <= 20.5 && q.impressions >= 10)),
    // On page one but clicked far less than that position usually gets: rewrite the title and description
    lowCtr: byImpressions(
      queries.filter((q) => q.position !== null && q.position <= 10 && q.impressions >= 30 && q.ctr < expectedCtr(q.position) / 2)
    ).map((q) => ({ ...q, expectedCtr: expectedCtr(q.position ?? 10) })),
    newQueries: previousByQuery
      ? byImpressions(queries.filter((q) => q.impressions >= 5 && q.previousPosition === null))
      : [],
    dropping: previousByQuery
      ? byImpressions(
          queries.filter((q) => q.impressions >= 10 && q.position !== null && q.previousPosition != null && q.position - q.previousPosition >= 3)
        )
      : [],
  };

  // Which page Google shows for each query (the one with the most impressions)
  const topPageByQuery = new Map<string, { page: string; impressions: number }>();
  for (const row of raw.queryPages) {
    const key = normalizeQuery(row.keys?.[0] ?? "");
    const page = pathOf(row.keys?.[1] ?? "");
    const best = topPageByQuery.get(key);
    if (!best || row.impressions > best.impressions) topPageByQuery.set(key, { page, impressions: row.impressions });
  }

  const currentByQuery = new Map(raw.queries.map((row) => [normalizeQuery(row.keys?.[0] ?? ""), row]));
  const tracked = keywords.map((keyword) => {
    const phrase = normalizeQuery(keyword.keyword);
    const exact = metricsOf(currentByQuery.get(phrase));
    const previous = previousByQuery ? metricsOf(previousByQuery.get(phrase)).position : undefined;
    // Every query that contains the phrase (spelling and word-order variants count separately)
    let relatedQueries = 0;
    const related = { clicks: 0, impressions: 0 };
    for (const row of raw.queries) {
      if (!normalizeQuery(row.keys?.[0] ?? "").includes(phrase)) continue;
      relatedQueries++;
      related.clicks += row.clicks;
      related.impressions += row.impressions;
    }
    const rankingPage = topPageByQuery.get(phrase)?.page ?? null;
    return {
      ...keyword,
      ...exact,
      previousPosition: previous,
      rankingPage,
      wrongPage: Boolean(rankingPage && keyword.targetPath && rankingPage !== keyword.targetPath.replace(/\/$/, "") && rankingPage !== keyword.targetPath),
      related: { queries: relatedQueries, ...related },
    };
  });

  const scriptSplit = { bangla: { clicks: 0, impressions: 0, queries: 0 }, latin: { clicks: 0, impressions: 0, queries: 0 } };
  for (const q of queries) {
    const bucket = q.bangla ? scriptSplit.bangla : scriptSplit.latin;
    bucket.clicks += q.clicks;
    bucket.impressions += q.impressions;
    bucket.queries++;
  }

  const byDate = new Map(raw.byDate.map((row) => [row.keys?.[0] ?? "", row]));
  return {
    connected: true as const,
    property,
    serviceAccount: connection.email,
    fetchedAt: new Date(fetchedAt).toISOString(),
    period: raw.window.current,
    previousPeriod: raw.window.previous,
    totals: metricsOf(raw.totals[0]),
    previousTotals: raw.previousTotals ? metricsOf(raw.previousTotals[0]) : null,
    trend: raw.window.dates.map((date) => ({ date, ...metricsOf(byDate.get(date)) })),
    queryCount: queries.length,
    queries: byClicks.slice(0, 250),
    pages: raw.pages.map((row) => ({ page: pathOf(row.keys?.[0] ?? ""), url: row.keys?.[0] ?? "", ...metricsOf(row) })),
    devices: raw.devices.map((row) => ({ device: (row.keys?.[0] ?? "").toLowerCase(), ...metricsOf(row) })),
    countries: raw.countries.map((row) => ({ country: (row.keys?.[0] ?? "").toLowerCase(), ...metricsOf(row) })),
    scriptSplit,
    opportunities,
    keywords: tracked,
  };
};

/** Checks the key and property: which properties the service account can read. */
export const testSearchConsole = async () => {
  const connection = await getClient();
  const property = await searchConsoleProperty();
  if (!connection) throw new ApiError(409, "Paste the service account's JSON key in Admin -> Settings -> Google Search Console first.");
  const result = await call<{ siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }>("/sites");
  const sites = (result.siteEntry ?? []).filter((site) => site.permissionLevel !== "siteUnverifiedUser");
  const hasAccess = sites.some((site) => site.siteUrl === property);
  return { serviceAccount: connection.email, property, hasAccess, sites };
};

export const listTrackedKeywords = async (): Promise<TrackedKeyword[]> =>
  (await prisma.seoKeyword.findMany({ orderBy: [{ targetPath: "asc" }, { language: "asc" }, { keyword: "asc" }] })).map((row) => ({
    id: row.id,
    keyword: row.keyword,
    language: row.language,
    targetPath: row.targetPath,
    notes: row.notes,
  }));

export const keywordLanguage = (keyword: string): "en" | "bn" => (BANGLA_SCRIPT.test(keyword) ? "bn" : "en");
export { normalizeQuery };
