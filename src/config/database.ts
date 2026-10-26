import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./index.js";

// The MariaDB driver adapter speaks the MySQL protocol, so it serves MySQL and MariaDB alike
const adapter = new PrismaMariaDb(config.db);

export const prisma = new PrismaClient({ adapter });

type DatabaseState = "disconnected" | "connected" | "connecting";

let state: DatabaseState = "disconnected";
let lastConnectionError: string | null = null;

const redact = (message: string) => message.replace(/mysql:\/\/\S+/gi, "<uri>");

export const connectDatabase = async (): Promise<void> => {
  state = "connecting";
  try {
    await prisma.$queryRaw`SELECT 1`;
    state = "connected";
    lastConnectionError = null;
    console.log("MySQL connected successfully");
  } catch (error) {
    state = "disconnected";
    lastConnectionError = redact(error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/** Connection state for the health check; the error never includes the connection string */
export const getDatabaseStatus = () => (state === "connected" ? { state } : { state, lastError: lastConnectionError });

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  state = "disconnected";
};
