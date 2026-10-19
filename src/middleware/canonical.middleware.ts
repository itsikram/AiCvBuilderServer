import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";

const canonical = new URL(config.siteUrl);

/**
 * 301s http -> https and www <-> apex to SITE_URL when FORCE_CANONICAL_HOST=true,
 * and strips trailing slashes from page URLs ("/about/" -> "/about").
 * Requires `trust proxy` so req.protocol reflects X-Forwarded-Proto behind cPanel/Render.
 */
export const canonicalRedirect = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const forceHost = process.env.FORCE_CANONICAL_HOST === "true";
  const wrongHost = forceHost && req.hostname !== canonical.hostname;
  const wrongProtocol = forceHost && canonical.protocol === "https:" && req.protocol !== "https";
  const trailingSlash = req.path.length > 1 && req.path.endsWith("/") && !req.path.startsWith("/api/");

  if (!wrongHost && !wrongProtocol && !trailingSlash) return next();

  const query = req.originalUrl.slice(req.path.length);
  const pathname = trailingSlash ? req.path.replace(/\/+$/, "") || "/" : req.path;
  const target = wrongHost || wrongProtocol ? `${config.siteUrl}${pathname}${query}` : `${pathname}${query}`;
  res.redirect(301, target);
};
