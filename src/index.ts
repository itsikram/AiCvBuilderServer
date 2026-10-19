import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";
import { getRedis } from "./config/redis.js";
import { initCloudinary } from "./services/cloudinary.service.js";
import routes from "./routes/index.js";
import siteRoutes from "./web/site.routes.js";
import { clientDistPath, hasClientBuild } from "./web/clientApp.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import { generalLimiter } from "./middleware/rateLimit.middleware.js";
import { canonicalRedirect } from "./middleware/canonical.middleware.js";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://www.googletagmanager.com", "https://accounts.google.com/gsi/client"],
        "connect-src": [
          "'self'",
          "https://accounts.google.com",
          "https://www.googletagmanager.com",
          "https://*.google-analytics.com",
          "https://*.analytics.google.com",
        ],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "style-src": ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
        "font-src": ["'self'", "data:"],
        "frame-src": ["https://accounts.google.com"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        "upgrade-insecure-requests": config.env === "production" ? [] : null,
      },
    },
    // Google Sign-In uses a popup that must be able to message this window
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
app.use(canonicalRedirect);
app.use(compression());
app.use(
  cors({
    // Same-origin requests send no Origin header; cross-origin ones must be allow-listed
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: true,
  })
);
app.use(morgan(config.env === "development" ? "dev" : "combined"));
app.use(cookieParser());

// Built client assets: hashed files are immutable, everything else revalidates daily.
// HTML is handled by siteRoutes so status codes and head tags are correct.
if (hasClientBuild()) {
  app.use(
    express.static(clientDistPath, {
      index: false,
      redirect: false,
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html") || filePath.endsWith(".json")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    })
  );
}

app.use(
  "/api/v1",
  generalLimiter,
  express.json({ limit: "5mb" }),
  express.urlencoded({ extended: true, limit: "5mb" }),
  mongoSanitize(),
  routes
);
app.use("/api", notFound);

app.use(siteRoutes);

// Development without a client build: the Vite dev server serves the UI
app.get("/", (_req, res) => {
  res.json({ name: config.app.name, version: "1.0.0", docs: "/api/v1/health" });
});

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await connectDatabase();
  initCloudinary();
  const redis = getRedis();
  if (redis) {
    try {
      await redis.connect();
      console.log("Redis connected");
    } catch {
      console.warn("Redis connection failed, continuing with the in-memory cache");
    }
  }

  app.listen(config.port, () => {
    console.log(`${config.app.name} API running on port ${config.port}`);
  });
};

if (process.env.NODE_ENV !== "test") {
  start();
}

export default app;
