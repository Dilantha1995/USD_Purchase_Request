// Vercel build entrypoint.
//
// Preview deployments (every non-main branch push, including feature
// branches) should never sync the schema or reseed the shared database —
// that's what caused preview builds to fail when the branch's build
// couldn't reach the DB, and worse, would let an in-progress feature branch
// push schema changes onto the live production database. Only production
// builds (and local builds, where VERCEL isn't set) touch the database.
const { execSync } = require("child_process");

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

run("prisma generate");

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.VERCEL_ENV === "production";

if (!isVercel || isProduction) {
  run("prisma db push");
  run("prisma db seed");
} else {
  console.log(
    `Skipping "prisma db push"/"prisma db seed" for VERCEL_ENV=${process.env.VERCEL_ENV || "unknown"} (non-production deployment).`
  );
}

run("next build");
