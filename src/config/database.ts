import dns from "dns";
import mongoose from "mongoose";
import { config } from "./index.js";

// Some local routers can't answer SRV lookups needed by mongodb+srv:// URIs
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()));
}

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
    lastConnectionError =
      error instanceof Error ? error.message.replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>") : String(error);
    throw error;
  }
};

let lastConnectionError: string | null = null;

const STATES: readonly string[] = ["disconnected", "connected", "connecting", "disconnecting"];

/** Connection state for the health check; the error never includes the connection string */
export const getDatabaseStatus = () => {
  const state = STATES[mongoose.connection.readyState] ?? "unknown";
  return state === "connected" ? { state } : { state, lastError: lastConnectionError };
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
