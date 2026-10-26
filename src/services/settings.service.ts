import { prisma } from "../config/database.js";

// Admin-editable settings (Admin -> Settings) are read on hot paths such as every AI
// request, so they are cached in process memory for a minute. Updates through the
// admin API call invalidateSettings(), so the admin's own process sees them at once.

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

/** The admin-set value, or undefined when the setting is missing or blank. */
export const getSetting = async (key: string): Promise<string | undefined> => {
  try {
    const value = (await values()).get(key)?.trim();
    return value ? value : undefined;
  } catch (error) {
    console.warn(`Could not read admin settings: ${(error as Error).message}`);
    return undefined;
  }
};

/** An admin-set whole number (>= -1, where -1 means unlimited), else `fallback`. */
export const getIntSetting = async (key: string, fallback: number): Promise<number> => {
  const raw = await getSetting(key);
  if (raw === undefined || !/^-?\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= -1 ? value : fallback;
};
