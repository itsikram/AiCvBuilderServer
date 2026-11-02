import type { Request } from "express";

/**
 * This API's public origin as the caller reached it, e.g. https://api.example.com. Behind a
 * proxy it relies on "trust proxy" (index.ts) for the scheme. Only use it for the caller's
 * own request, never store it: the Host header is set by the client.
 */
export const apiOriginOf = (req: Request) => `${req.protocol}://${req.get("host")}`;
