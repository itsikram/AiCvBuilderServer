import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { normalizeLanguageField } from "../utils/language.js";

type Source = "body" | "params" | "query";

/**
 * Validates one part of the request. On success the parsed value replaces it, so
 * controllers only ever see whitelisted, typed fields (unknown keys are stripped).
 */
export const validate =
  (schema: ZodSchema, source: Source = "body") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const input = normalizeLanguageField({ ...((req[source] as Record<string, unknown>) ?? {}) });
    const result = schema.safeParse(input);

    if (!result.success) {
      const errors: Record<string, string[]> = {};
      result.error.errors.forEach((e) => {
        const key = e.path.join(".") || source;
        if (!errors[key]) errors[key] = [];
        errors[key].push(e.message);
      });
      next(new ApiError(400, "Validation failed", true, errors));
      return;
    }

    if (source === "query") {
      // req.query is a getter in Express 5-style typings; mutate in place
      Object.keys(req.query).forEach((key) => delete (req.query as Record<string, unknown>)[key]);
      Object.assign(req.query, result.data);
    } else {
      (req as unknown as Record<Source, unknown>)[source] = result.data;
    }
    next();
  };
