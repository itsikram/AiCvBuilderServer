import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/scripts/seed.ts",
  },
  datasource: {
    // Generating the client needs no database, so a placeholder keeps `prisma generate`
    // working in builds that have no DATABASE_URL yet
    url: process.env.DATABASE_URL || "mysql://user:password@localhost:3306/aicvbuilderbd",
  },
});
