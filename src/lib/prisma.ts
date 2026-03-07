import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // Use DIRECT_URL (port 5432, session mode) — the transaction pooler (port 6543)
  // is incompatible with the pg driver adapter.
  let connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";

  // Strip ?pgbouncer=true if present — it causes "Tenant or user not found"
  // when the pg driver adapter is used with the session-mode pooler.
  connectionString = connectionString.replace(/[?&]pgbouncer=true/i, "");

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
