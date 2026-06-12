import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  // --- Companies (letterhead PDFs are stored in the DB so generation works on serverless) ---
  const synergyPdf = readFileSync(join(__dirname, "templates", "prosynergy.pdf"));
  const pharmaPdf = readFileSync(join(__dirname, "templates", "propharma.pdf"));

  await prisma.company.upsert({
    where: { id: "PSMS" },
    create: {
      id: "PSMS",
      name: "ProSynergy Medical Systems Pvt Ltd",
      refPrefix: "PSMS",
      brandColor: "#7aa83a",
      templatePdf: synergyPdf,
      nextSerial: 8,
    },
    update: {
      name: "ProSynergy Medical Systems Pvt Ltd",
      refPrefix: "PSMS",
      brandColor: "#7aa83a",
      templatePdf: synergyPdf,
    },
  });

  await prisma.company.upsert({
    where: { id: "PPM" },
    create: {
      id: "PPM",
      name: "ProPharma Maldives Pvt Ltd",
      refPrefix: "PPM",
      brandColor: "#15a7e0",
      templatePdf: pharmaPdf,
      nextSerial: 1,
    },
    update: {
      name: "ProPharma Maldives Pvt Ltd",
      refPrefix: "PPM",
      brandColor: "#15a7e0",
      templatePdf: pharmaPdf,
    },
  });

  // --- Admin user ---
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@propharmamaldives.com").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME || "Administrator";
  const password = process.env.SEED_ADMIN_PASSWORD || "change-this-password";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "ADMIN", active: true },
    update: { name, passwordHash, role: "ADMIN", active: true },
  });
  console.log(`Admin user ready: ${email}`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
