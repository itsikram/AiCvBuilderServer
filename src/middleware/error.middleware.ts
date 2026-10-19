import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import multer from "multer";
import { config } from "../config/index.js";

export const errorHandler = (
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "File is too large" : err.message,
    });
    return;
  }

  // Body parser errors (malformed JSON, payload too large)
  const status = (err as { status?: number; type?: string }).status;
  if (status === 413 || (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ success: false, message: "Request is too large" });
    return;
  }
  if (status === 400 && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Malformed JSON body" });
    return;
  }

  // File-type rejections thrown from multer fileFilter callbacks
  if (/^Only .* (supported|allowed)/.test(err.message)) {
    res.status(415).json({ success: false, message: err.message });
    return;
  }

  if (err.name === "ValidationError") {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  if (err.name === "CastError") {
    res.status(400).json({ success: false, message: "Invalid ID format" });
    return;
  }

  if ((err as { code?: number }).code === 11000) {
    res.status(409).json({ success: false, message: "Duplicate field value" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: config.env === "production" ? "Internal server error" : err.message,
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: "Route not found" });
};
