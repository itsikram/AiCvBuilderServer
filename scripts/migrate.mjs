// Applies pending Prisma migrations (`prisma migrate deploy`), recovering from a failed
// init migration. MySQL cannot roll back CREATE TABLE, so a failed first run leaves some
// tables behind and Prisma refuses to continue (P3009). The init migration only creates
// tables IF NOT EXISTS, so it is marked rolled back and applied again.
import { spawnSync } from "node:child_process";

const INIT_MIGRATION = "20261026213007_init";

const prisma = (...args) => {
  const result = spawnSync("npx", ["prisma", ...args], { encoding: "utf8", shell: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { ok: result.status === 0, output };
};

let deploy = prisma("migrate", "deploy");
if (!deploy.ok && deploy.output.includes("P3009") && deploy.output.includes(INIT_MIGRATION)) {
  console.log(`Retrying the failed ${INIT_MIGRATION} migration`);
  if (prisma("migrate", "resolve", "--rolled-back", INIT_MIGRATION).ok) {
    deploy = prisma("migrate", "deploy");
  }
}
process.exit(deploy.ok ? 0 : 1);
