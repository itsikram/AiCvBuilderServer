/**
 * Sends one test email with the saved Email (SMTP) settings (Admin -> Settings, .env fallback).
 *   Local:  npx tsx src/scripts/test-email.ts you@example.com
 *   cPanel: node dist/scripts/test-email.js you@example.com
 */
import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { sendTestEmail } from "../services/email.service.js";

dotenv.config();

const to = process.argv[2];
if (!to) {
  console.error("Usage: node dist/scripts/test-email.js <recipient@example.com>");
  process.exit(1);
}

try {
  await connectDatabase();
  const result = await sendTestEmail(to, "test-email script");
  console.log(`Sent to ${result.to} via ${result.host}:${result.port} from ${result.from}`);
} catch (error) {
  console.error(`Failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
