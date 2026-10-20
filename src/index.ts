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
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import { generalLimiter } from "./middleware/rateLimit.middleware.js";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// JSON API only; the frontend is deployed separately and sets its own CSP
app.use(
  helmet({
    contentSecurityPolicy: false,
    // PDFs and files are fetched from the frontend's origin
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
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

app.use(
  "/api/v1",
  generalLimiter,
  express.json({ limit: "5mb" }),
  express.urlencoded({ extended: true, limit: "5mb" }),
  mongoSanitize(),
  routes
);
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
