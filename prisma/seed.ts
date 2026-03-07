/**
 * Seed script
 *
 * Production:  only seeds the admin account (idempotent — safe to run multiple times)
 * Development: seeds the admin account + a set of test users
 *
 * Run manually:  pnpm db:seed
 * Run via CLI:   pnpm prisma db seed
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@storytime.gg";
const IS_PROD = process.env.NODE_ENV === "production";

async function seedAdmin() {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "ADMIN",
    },
  });

  console.log(`✔  Admin account: ${admin.email} (id: ${admin.id})`);
}

async function seedDevData() {
  const devUsers = [
    { email: "alice@storytime.gg", name: "Alice" },
    { email: "bob@storytime.gg", name: "Bob" },
    { email: "carol@storytime.gg", name: "Carol" },
  ];

  for (const user of devUsers) {
    const u = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { email: user.email, name: user.name },
    });
    console.log(`✔  Dev user: ${u.email}`);
  }
}

async function main() {
  console.log(`\n🌱  Seeding (${IS_PROD ? "production" : "development"}) ...\n`);

  await seedAdmin();

  if (!IS_PROD) {
    await seedDevData();
  }

  console.log("\n✅  Seeding complete.\n");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
