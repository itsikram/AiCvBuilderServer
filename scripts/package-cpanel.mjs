// Builds an upload-ready bundle for cPanel "Setup Node.js App" in deploy/cpanel/
// (and deploy/aicv-api-cpanel.zip when a zip tool is available).
// Run `npm run build` first; `npm run package:cpanel` does both.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "deploy", "cpanel");
const zip = path.join(root, "deploy", "aicv-api-cpanel.zip");

if (!fs.existsSync(path.join(root, "dist", "index.js"))) {
  throw new Error("dist/index.js is missing; run `npm run build` first");
}

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(out, { recursive: true });

fs.cpSync(path.join(root, "dist"), path.join(out, "dist"), {
  recursive: true,
  // Source maps and compiled tests aren't needed on the server
  filter: (src) => !src.endsWith(".map") && !src.endsWith(".test.js"),
});
for (const file of ["app.cjs", "package.json", "package-lock.json", "prisma.config.ts"]) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
// The schema and migrations: `npm install` runs `prisma generate`, and `npm run db:deploy`
// applies the migrations to the cPanel MySQL database
fs.cpSync(path.join(root, "prisma"), path.join(out, "prisma"), { recursive: true });
// cPanel's "Run NPM Install" runs plain `npm install`; skip dev dependencies (TypeScript,
// the MongoDB driver used only by the one-off data migration) to stay inside shared-hosting limits
fs.writeFileSync(path.join(out, ".npmrc"), "omit=dev\nfund=false\naudit=false\n");

try {
  // Windows 10+ ships bsdtar, which writes zip files with -a; elsewhere use zip. Call it by full
  // path: Git Bash's GNU tar comes first on PATH and can't write zips.
  if (process.platform === "win32") {
    const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    execFileSync(tar, ["-a", "-c", "-f", path.relative(out, zip), "."], { cwd: out, stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", zip, "."], { cwd: out, stdio: "inherit" });
  }
  console.log(`Created ${path.relative(root, zip)}`);
} catch {
  console.log(`No zip tool found; zip the contents of ${path.relative(root, out)} yourself`);
}
console.log(
  "Upload it to the application root, extract, then Run NPM Install, run `npm run db:deploy` " +
    "(cPanel Terminal, in the app's virtual environment) and Restart in cPanel."
);
