import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError.js";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      ...req.body,
      ...req.params,
      ...req.query,
    });
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      result.error.errors.forEach((e) => {
        const key = e.path.join(".");
        if (!errors[key]) errors[key] = [];
        errors[key].push(e.message);
      });
      next(new ApiError(400, "Validation failed", true, errors));
      return;
    }
    Object.assign(req, { validated: result.data });
    next();
  };
