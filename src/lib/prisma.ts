import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

type RuntimeEnvironment = "development" | "preview" | "production";
type ConnectionCandidate = {
  source: "DATABASE_URL" | "PREVIEW_DATABASE_URL" | "DIRECT_URL" | "PREVIEW_DIRECT_URL";
  value: string;
};

function readPositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

function getConnectionHost(connectionString: string): string | null {
  if (!connectionString) {
    return null;
  }

  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

function isSupabaseDirectHost(host: string | null): boolean {
  return Boolean(host && /^db\.[a-z0-9]+\.supabase\.co$/i.test(host));
}

function isSupabasePoolerHost(host: string | null): boolean {
  return Boolean(host && /(?:^|\.)pooler\.supabase\.com$/i.test(host));
}

function shouldLogPrismaConnection(): boolean {
  return process.env.PRISMA_LOG_CONNECTION_HOST === "1";
}

function createPrismaClient() {
  const runtimeEnvironment = getRuntimeEnvironment();

  const candidates = [
    { source: "DATABASE_URL", value: process.env.DATABASE_URL ?? "" },
    { source: "PREVIEW_DATABASE_URL", value: process.env.PREVIEW_DATABASE_URL ?? "" },
    { source: "DIRECT_URL", value: process.env.DIRECT_URL ?? "" },
    { source: "PREVIEW_DIRECT_URL", value: process.env.PREVIEW_DIRECT_URL ?? "" },
  ] satisfies ConnectionCandidate[];

  const configuredCandidates = candidates.filter((candidate) => candidate.value.length > 0);

  const databaseCandidate =
    configuredCandidates.find((candidate) => candidate.source === "DATABASE_URL") ??
    configuredCandidates.find((candidate) => candidate.source === "PREVIEW_DATABASE_URL") ??
    null;

  const directCandidate =
    configuredCandidates.find((candidate) => candidate.source === "DIRECT_URL") ??
    configuredCandidates.find((candidate) => candidate.source === "PREVIEW_DIRECT_URL") ??
    null;

  // Prefer DATABASE_URL at runtime (typically Supabase pooler in preview/prod).
  // Keep DIRECT_URL as fallback for environments that only provide direct URLs.
  const databaseUrl = databaseCandidate?.value ?? "";
  const directUrl = directCandidate?.value ?? "";

  let connectionString = databaseUrl || directUrl;
  let connectionSource =
    (databaseUrl ? databaseCandidate?.source : directCandidate?.source) ?? "UNKNOWN";

  if (!connectionString) {
    throw new Error(
      "Prisma database URL is not configured. Set DATABASE_URL (preferred) or DIRECT_URL. " +
        "On Vercel Preview, use the same variable names in the Preview scope."
    );
  }

  const databaseHost = getConnectionHost(databaseUrl);
  const directHost = getConnectionHost(directUrl);

  // Guard against swapped Supabase envs where runtime accidentally points to the direct host.
  if (
    databaseUrl &&
    directUrl &&
    isSupabaseDirectHost(databaseHost) &&
    isSupabasePoolerHost(directHost)
  ) {
    connectionString = directUrl;
    connectionSource = directCandidate?.source ?? connectionSource;
    console.warn(
      "Prisma DATABASE_URL/DIRECT_URL appear swapped; using DIRECT_URL at runtime because it points to the Supabase pooler."
    );
  }

  if (
    runtimeEnvironment !== "development" &&
    !isSupabasePoolerHost(getConnectionHost(connectionString))
  ) {
    const fallbackPoolerCandidate = configuredCandidates.find((candidate) =>
      isSupabasePoolerHost(getConnectionHost(candidate.value))
    );

    if (fallbackPoolerCandidate) {
      connectionString = fallbackPoolerCandidate.value;
      connectionSource = fallbackPoolerCandidate.source;
      console.warn(
        `Prisma selected a non-pooler URL for hosted runtime; using ${fallbackPoolerCandidate.source} because it points to the Supabase transaction pooler.`
      );
    }
  }

  if (!databaseUrl && directUrl && runtimeEnvironment !== "development") {
    console.warn(
      "Prisma DATABASE_URL is missing in hosted runtime. Falling back to DIRECT_URL can cause P1001; set DATABASE_URL to the Supabase transaction pooler URL (port 6543)."
    );
  }

  const selectedHost = getConnectionHost(connectionString);

  if (shouldLogPrismaConnection()) {
    console.info(
      `[prisma] runtime=${runtimeEnvironment} source=${connectionSource} host=${selectedHost ?? "unknown"}`
    );
  }

  if (runtimeEnvironment !== "development" && isSupabaseDirectHost(selectedHost)) {
    console.warn(
      `Prisma is using direct Supabase host (${selectedHost}) in ${runtimeEnvironment}. This can fail with P1001 in Preview/Serverless. Use DATABASE_URL with the transaction pooler host on port 6543.`
    );
  }

  // Strip ?pgbouncer=true if present — it causes "Tenant or user not found"
  // when the pg driver adapter is used with the session-mode pooler.
  connectionString = connectionString.replace(/[?&]pgbouncer=true/i, "");

  const defaultPoolMax = process.env.NODE_ENV === "production" ? 1 : 5;
  const poolMax = readPositiveInteger(process.env.PRISMA_POOL_MAX) ?? defaultPoolMax;
  const poolIdleTimeoutMs = readPositiveInteger(process.env.PRISMA_POOL_IDLE_TIMEOUT_MS) ?? 10000;
  const poolConnectionTimeoutMs =
    readPositiveInteger(process.env.PRISMA_POOL_CONNECTION_TIMEOUT_MS) ?? 10000;

  const pool =
    globalForPrisma.prismaPool ??
    new Pool({
      connectionString,
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeoutMs,
      connectionTimeoutMillis: poolConnectionTimeoutMs,
      allowExitOnIdle: process.env.NODE_ENV !== "production",
    });

  const adapter = new PrismaPg(pool, {
    disposeExternalPool: false,
    onPoolError: (error) => {
      console.error("Prisma pool error", error);
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaPool = pool;
  }

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
