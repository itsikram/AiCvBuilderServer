export type SupportedLanguage = "en" | "bn";

export const normalizeLanguage = (value: unknown): SupportedLanguage => {
  if (typeof value !== "string") {
    return "en";
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("bn")) {
    return "bn";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return "en";
};

export const normalizeLanguageField = <T extends Record<string, unknown>>(payload: T): T => {
  if (Object.prototype.hasOwnProperty.call(payload, "language")) {
    (payload as Record<string, unknown>).language = normalizeLanguage(
      (payload as Record<string, unknown>).language
    );
  }
  return payload;
};
