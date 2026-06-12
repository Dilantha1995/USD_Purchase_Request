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
    // NOTE: nextSerial is only set on first creation. Set the starting number to
    // continue from your existing manual sequence (e.g. 8 if 07 was the last one).
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

  // --- Initial admin user ---
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@propharmamaldives.com").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME || "Administrator";
  const password = process.env.SEED_ADMIN_PASSWORD || "change-this-password";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 10),
        role: "ADMIN",
      },
    });
    console.log(`Created admin user: ${email}`);
  } else {
    console.log(`Admin user already exists: ${email}`);
  }

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
