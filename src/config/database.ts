import mongoose from "mongoose";
import { config } from "./index.js";

let memoryServer: { stop: () => Promise<boolean>; getUri: () => string } | null = null;

export const connectDatabase = async (): Promise<void> => {
  let uri = config.mongodbUri;

  if (process.env.USE_MEMORY_DB === "true") {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log("Using in-memory MongoDB for development");
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    if (config.env === "development" && process.env.USE_MEMORY_DB !== "true") {
      console.warn("MongoDB connection failed, falling back to in-memory database...");
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      memoryServer = await MongoMemoryServer.create();
      await mongoose.connect(memoryServer.getUri());
      console.log("In-memory MongoDB connected successfully");
      return;
    }
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
};
