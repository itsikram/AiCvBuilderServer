import { config } from "../config/index.js";

/** The domain property for the site's own host, e.g. sc-domain:aicvbuilderbd.online */
export const defaultSearchConsoleProperty = (): string => {
  try {
    return `sc-domain:${new URL(config.clientUrl).hostname.replace(/^www\./, "")}`;
  } catch {
    return "";
  }
};
