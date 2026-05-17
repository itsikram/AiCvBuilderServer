import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/tokens.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

export interface AuthRequest extends Request {
  user?: TokenPayload & { id: string };
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies?.accessToken;

    if (!token) throw new ApiError(401, "Authentication required");

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.userId);
    if (!user) throw new ApiError(401, "User not found");

    req.user = { ...payload, id: payload.userId };
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = { ...payload, id: payload.userId };
    }
  } catch {
    /* optional */
  }
  next();
};

export const requireAdmin = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== "admin") {
    next(new ApiError(403, "Admin access required"));
    return;
  }
  next();
};

export const requireVerifiedEmail = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await User.findById(req.user?.userId);
  if (!user?.isEmailVerified) {
    next(new ApiError(403, "Please verify your email first"));
    return;
  }
  next();
};
