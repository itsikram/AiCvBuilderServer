import "dotenv/config";
import { defineConfig } from "prisma/config";
import { dbSettingsFromEnv, dbUrl } from "./src/config/db.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/scripts/seed.ts",
  },
  datasource: {
    // Built from DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD. `prisma generate`
    // never connects, so builds without them still work.
    url: dbUrl(dbSettingsFromEnv()),
  },
});
