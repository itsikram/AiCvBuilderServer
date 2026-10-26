import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as mariadb from "mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./index.js";

// The MariaDB driver speaks the MySQL protocol, so it serves MySQL and MariaDB alike.
// The pool is created here (not by the adapter) so its connection errors can be recorded:
// Prisma only reports "pool failed to retrieve a connection" and drops the reason.
const pool = mariadb.createPool({
  // The adapter's default: Prisma manages its own statement cache
  prepareCacheLength: 0,
  ...config.db,
  // Node resolves "localhost" to ::1 first, but MySQL usually listens on 127.0.0.1 only
  host: config.db.host === "localhost" ? "127.0.0.1" : config.db.host,
  // The driver's 1s default is too short for a remote database; a failed handshake leaves
  // the pool empty and every query fails with "pool failed to retrieve a connection"
  connectTimeout: 10_000,
  acquireTimeout: 20_000,
  // DB_SSL=true for servers that require TLS (certificates are verified)
  ...(process.env.DB_SSL === "true" ? { ssl: true } : {}),
  // MySQL 8's caching_sha2_password without TLS needs the server's RSA key; opt in with
  // DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true when the error says "RSA public key is not available"
  allowPublicKeyRetrieval: process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL === "true",
});

type DatabaseState = "disconnected" | "connected" | "connecting";

let state: DatabaseState = "disconnected";
let lastConnectionError: string | null = null;
let lastPoolError: unknown = null;

// The Pool typings omit the "error" event, which the driver emits for each failed connection attempt
(pool as unknown as NodeJS.EventEmitter).on("error", (error: unknown) => {
  lastPoolError = error;
});

export const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });

const redact = (message: string) => message.replace(/mysql:\/\/\S+/gi, "<uri>");

/** The pool error hides why connecting failed; the driver's own error is further down the cause chain */
const describeError = (error: unknown): string => {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const message = typeof current.message === "string" ? current.message.trim() : "";
    const code = current.code ?? current.originalCode ?? current.kind;
    const line = [code ? `[${code}]` : "", message].filter(Boolean).join(" ");
    if (line && !messages.includes(line)) messages.push(line);
    current = current.meta?.driverAdapterError ?? current.cause;
  }
  return redact(messages.join(" <- caused by: ") || String(error));
};

export const connectDatabase = async (): Promise<void> => {
  state = "connecting";
  try {
    await prisma.$queryRaw`SELECT 1`;
    state = "connected";
    lastConnectionError = null;
    lastPoolError = null;
    console.log("MySQL connected successfully");
  } catch (error) {
    state = "disconnected";
    lastConnectionError = describeError(lastPoolError ?? error);
    throw new Error(lastConnectionError);
  }
};

/** Connection state for the health check; the error never includes the connection string */
export const getDatabaseStatus = () => (state === "connected" ? { state } : { state, lastError: lastConnectionError });

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  await pool.end();
  state = "disconnected";
};
