import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Built client (Vite output plus prerendered pages). Works from src/ (tsx) and dist/ (node). */
export const clientDistPath = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, "../../../client/dist");

export const hasClientBuild = () => fs.existsSync(path.join(clientDistPath, "index.html"));

export interface PrerenderedRoute {
  path: string;
  lang: "en" | "bn";
  lastmod: string;
}

let manifestCache: PrerenderedRoute[] | null = null;
export const getPrerenderedRoutes = (): PrerenderedRoute[] => {
  if (manifestCache) return manifestCache;
  try {
    const raw = fs.readFileSync(path.join(clientDistPath, "prerender-manifest.json"), "utf8");
    manifestCache = (JSON.parse(raw) as { routes: PrerenderedRoute[] }).routes;
  } catch {
    manifestCache = [];
  }
  return manifestCache;
};

const fileCache = new Map<string, string>();
const readCached = (file: string): string | null => {
  if (fileCache.has(file)) return fileCache.get(file)!;
  try {
    const content = fs.readFileSync(file, "utf8");
    if (config.env === "production") fileCache.set(file, content);
    return content;
  } catch {
    return null;
  }
};

/** HTML for a prerendered public path ("/", "/bn/about"), or null if none exists. */
export const readPrerenderedPage = (urlPath: string): string | null => {
  const clean = path.posix.normalize(urlPath);
  if (clean.includes("..")) return null;
  const file = clean === "/" ? "index.html" : path.join(clean.slice(1), "index.html");
  return readCached(path.join(clientDistPath, file));
};

/** Empty app shell for client-rendered routes (dashboard, editor, auth). */
export const readSpaShell = () =>
  readCached(path.join(clientDistPath, "spa.html")) ?? readCached(path.join(clientDistPath, "index.html"));

export const readNotFoundPage = () => readCached(path.join(clientDistPath, "404.html")) ?? readSpaShell();

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces the template's default head block with page-specific tags. */
export const injectHead = (
  html: string,
  head: { title: string; description: string; canonical: string; lang: "en" | "bn"; image?: string; type?: string; jsonLd?: object[] }
) => {
  const image = head.image || `${config.siteUrl}/og-image.jpg`;
  const tags = [
    `<title data-prerender>${escapeHtml(head.title)}</title>`,
    `<meta data-prerender name="description" content="${escapeHtml(head.description)}" />`,
    `<meta data-prerender name="robots" content="index, follow, max-image-preview:large" />`,
    `<link data-prerender rel="canonical" href="${escapeHtml(head.canonical)}" />`,
    `<meta data-prerender property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta data-prerender property="og:description" content="${escapeHtml(head.description)}" />`,
    `<meta data-prerender property="og:url" content="${escapeHtml(head.canonical)}" />`,
    `<meta data-prerender property="og:type" content="${head.type || "website"}" />`,
    `<meta data-prerender property="og:image" content="${escapeHtml(image)}" />`,
    `<meta data-prerender property="og:site_name" content="${escapeHtml(config.app.name)}" />`,
    `<meta data-prerender name="twitter:card" content="summary_large_image" />`,
    ...(head.jsonLd || []).map(
      (data) => `<script data-prerender type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
    ),
  ];
  return html
    .replace(/<html lang="[^"]*">/, `<html lang="${head.lang === "bn" ? "bn-BD" : "en-BD"}">`)
    .replace(/<!--head:start-->[\s\S]*?<!--head:end-->/, `<!--head:start-->\n    ${tags.join("\n    ")}\n    <!--head:end-->`);
};
