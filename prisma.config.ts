import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use the direct (non-pooled) URL for migrations to bypass PgBouncer
    url: process.env.DIRECT_URL!,
  },
});
