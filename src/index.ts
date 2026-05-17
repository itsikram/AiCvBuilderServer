import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
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

app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(morgan(config.env === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(generalLimiter);

app.use("/api/v1", routes);

app.get("/", (_req, res) => {
  res.json({
    name: config.app.name,
    version: "1.0.0",
    docs: "/api/v1/health",
  });
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
      console.warn("Redis connection failed, continuing without cache");
    }
  }

  app.listen(config.port, () => {
    console.log(`${config.app.name} API running on port ${config.port}`);
  });
};

start();

export default app;
