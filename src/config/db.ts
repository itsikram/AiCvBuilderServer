// MySQL connection settings from DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD.
// Shared by the app and prisma.config.ts (the Prisma CLI), so it reads only the
// environment and imports nothing.

export interface DbSettings {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export const dbSettingsFromEnv = (env: NodeJS.ProcessEnv = process.env): DbSettings => ({
  host: env.DB_HOST || "localhost",
  port: Number(env.DB_PORT) || 3306,
  database: env.DB_NAME || "aicvbuilderbd",
  user: env.DB_USER || "root",
  password: env.DB_PASSWORD || "",
});

/** mysql:// URL for the Prisma CLI; each part is encoded, so passwords may hold any character */
export const dbUrl = ({ host, port, database, user, password }: DbSettings) => {
  const credentials = encodeURIComponent(user) + (password ? `:${encodeURIComponent(password)}` : "");
  return `mysql://${credentials}@${host}:${port}/${encodeURIComponent(database)}`;
};
