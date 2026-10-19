import { Router, type Request, type Response, type NextFunction } from "express";
import { config } from "../config/index.js";
import { Blog } from "../models/Blog.js";
import { Resume } from "../models/Resume.js";
import {
  getPrerenderedRoutes,
  hasClientBuild,
  injectHead,
  readNotFoundPage,
  readPrerenderedPage,
  readSpaShell,
} from "./clientApp.js";

const router = Router();

// Client-rendered app sections: served with the empty shell and kept out of the index
const APP_PREFIXES = ["/dashboard", "/admin", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
const isAppPath = (p: string) => APP_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" };

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(
    [
      "User-agent: *",
      "Disallow: /api/",
      "Disallow: /dashboard",
      "Disallow: /admin",
      "Disallow: /r/",
      "Allow: /",
      "",
      `Sitemap: ${config.siteUrl}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

let sitemapCache: { xml: string; expires: number } | null = null;

router.get("/sitemap.xml", async (_req, res, next) => {
  try {
    if (!sitemapCache || sitemapCache.expires < Date.now()) {
      const routes = getPrerenderedRoutes();
      const byBase = new Map<string, { en?: string; bn?: string; lastmod: string }>();
      for (const route of routes) {
        const base = route.path.replace(/^\/bn(?=\/|$)/, "") || "/";
        const entry = byBase.get(base) ?? { lastmod: route.lastmod };
        entry[route.lang] = route.path;
        if (route.lastmod > entry.lastmod) entry.lastmod = route.lastmod;
        byBase.set(base, entry);
      }

      const urls: string[] = [];
      for (const entry of byBase.values()) {
        const alternates = entry.en && entry.bn
          ? [
              `<xhtml:link rel="alternate" hreflang="en-BD" href="${config.siteUrl}${entry.en}"/>`,
              `<xhtml:link rel="alternate" hreflang="bn-BD" href="${config.siteUrl}${entry.bn}"/>`,
              `<xhtml:link rel="alternate" hreflang="x-default" href="${config.siteUrl}${entry.en}"/>`,
            ].join("")
          : "";
        for (const p of [entry.en, entry.bn]) {
          if (!p) continue;
          urls.push(`<url><loc>${config.siteUrl}${p === "/" ? "/" : p}</loc><lastmod>${entry.lastmod}</lastmod>${alternates}</url>`);
        }
      }

      const posts = await Blog.find({ isPublished: true }).select("slug language updatedAt").lean();
      for (const post of posts) {
        const p = `${post.language === "bn" ? "/bn" : ""}/blog/${post.slug}`;
        urls.push(`<url><loc>${config.siteUrl}${xmlEscape(p)}</loc><lastmod>${new Date(post.updatedAt).toISOString().slice(0, 10)}</lastmod></url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
      sitemapCache = { xml, expires: Date.now() + 60 * 60 * 1000 };
    }
    res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(sitemapCache.xml);
  } catch (error) {
    next(error);
  }
});

const sendNotFound = (res: Response) => {
  const page = readNotFoundPage();
  res.status(404).set(HTML_HEADERS).set("X-Robots-Tag", "noindex");
  page ? res.send(page) : res.send("Not found");
};

/** Blog posts are client-rendered; inject real head tags so crawlers and link previews see them. */
const blogPost = async (req: Request, res: Response, next: NextFunction) => {
  if (!hasClientBuild()) return next();
  try {
    const urlLang = req.path.startsWith("/bn/") ? "bn" : "en";
    const post = await Blog.findOne({ slug: req.params.slug, isPublished: true })
      .select("title slug excerpt metaTitle metaDescription coverImage language publishedAt updatedAt")
      .lean();
    if (!post) return sendNotFound(res);

    const correctPath = `${post.language === "bn" ? "/bn" : ""}/blog/${post.slug}`;
    if (post.language !== urlLang) return res.redirect(301, correctPath);

    const canonical = `${config.siteUrl}${correctPath}`;
    const description = post.metaDescription || post.excerpt;
    const html = injectHead(readSpaShell() ?? "", {
      title: post.metaTitle || post.title,
      description,
      canonical,
      lang: post.language,
      image: post.coverImage,
      type: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description,
          mainEntityOfPage: canonical,
          image: post.coverImage || `${config.siteUrl}/og-image.jpg`,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          author: { "@type": "Organization", name: config.app.name, url: config.siteUrl },
          publisher: { "@id": `${config.siteUrl}/#organization` },
        },
      ],
    });
    res.status(200).set(HTML_HEADERS).send(html);
  } catch (error) {
    next(error);
  }
};
router.get(["/blog/:slug", "/bn/blog/:slug"], blogPost);

/** Shared CVs: real 404 when the link is invalid; never indexed (personal data). */
router.get("/r/:slug", async (req, res, next) => {
  if (!hasClientBuild()) return next();
  try {
    const exists = await Resume.exists({ publicSlug: req.params.slug, isPublic: true });
    if (!exists) return sendNotFound(res);
    res.status(200).set(HTML_HEADERS).set("X-Robots-Tag", "noindex").send(readSpaShell());
  } catch (error) {
    next(error);
  }
});

router.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || !hasClientBuild()) return next();

  const page = readPrerenderedPage(req.path);
  if (page) return res.status(200).set(HTML_HEADERS).send(page);

  if (isAppPath(req.path)) {
    return res.status(200).set(HTML_HEADERS).set("X-Robots-Tag", "noindex").send(readSpaShell());
  }

  sendNotFound(res);
});

export default router;
