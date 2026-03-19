import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadPrismaModule(envOverrides: Record<string, string | undefined>) {
  setEnv({
    NODE_ENV: "development",
    VERCEL_ENV: undefined,
    DATABASE_URL: undefined,
    PREVIEW_DATABASE_URL: undefined,
    DIRECT_URL: undefined,
    PREVIEW_DIRECT_URL: undefined,
    PRISMA_POOL_MAX: undefined,
    PRISMA_POOL_IDLE_TIMEOUT_MS: undefined,
    PRISMA_POOL_CONNECTION_TIMEOUT_MS: undefined,
    PRISMA_LOG_CONNECTION_HOST: undefined,
    ...envOverrides,
  });

  const PrismaClientMock = vi.fn(function MockPrismaClient(
    this: unknown,
    {
      adapter,
    }: {
      adapter: unknown;
    }
  ) {
    return {
      adapter,
      type: "mock-prisma-client",
    };
  });

  const PrismaPgMock = vi.fn(function MockPrismaPg(this: unknown, pool: unknown, options: unknown) {
    return {
      pool,
      options,
      type: "mock-adapter",
    };
  });

  const PoolMock = vi.fn(function MockPool(this: unknown, config: unknown) {
    return {
      config,
      type: "mock-pool",
    };
  });

  vi.doMock("@prisma/client", () => ({
    PrismaClient: PrismaClientMock,
  }));

  vi.doMock("@prisma/adapter-pg", () => ({
    PrismaPg: PrismaPgMock,
  }));

  vi.doMock("pg", () => ({
    Pool: PoolMock,
  }));

  const loadedModule = await import("@/lib/prisma");

  return {
    ...loadedModule,
    PrismaClientMock,
    PrismaPgMock,
    PoolMock,
  };
}

describe("prisma runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete (globalThis as { prisma?: unknown }).prisma;
    delete (globalThis as { prismaPool?: unknown }).prismaPool;

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws when no database connection string is configured", async () => {
    await expect(loadPrismaModule({})).rejects.toThrow("Prisma database URL is not configured");
  });

  it("builds development client using DATABASE_URL and strips pgbouncer param", async () => {
    const { prisma, PrismaClientMock, PrismaPgMock, PoolMock } = await loadPrismaModule({
      NODE_ENV: "development",
      DATABASE_URL:
        "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
      PRISMA_POOL_MAX: "7",
      PRISMA_POOL_IDLE_TIMEOUT_MS: "9000",
      PRISMA_POOL_CONNECTION_TIMEOUT_MS: "11000",
      PRISMA_LOG_CONNECTION_HOST: "1",
    });

    expect(prisma).toBeDefined();
    expect(PoolMock).toHaveBeenCalledTimes(1);

    const poolConfig = PoolMock.mock.calls[0][0] as {
      connectionString: string;
      max: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      allowExitOnIdle: boolean;
    };

    expect(poolConfig.connectionString).toBe(
      "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    expect(poolConfig.max).toBe(7);
    expect(poolConfig.idleTimeoutMillis).toBe(9000);
    expect(poolConfig.connectionTimeoutMillis).toBe(11000);
    expect(poolConfig.allowExitOnIdle).toBe(true);

    expect(PrismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mock-pool" }),
      expect.objectContaining({
        disposeExternalPool: false,
        onPoolError: expect.any(Function),
      })
    );
    expect(PrismaClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.objectContaining({ type: "mock-adapter" }),
      })
    );

    expect((globalThis as { prisma?: unknown }).prisma).toBeDefined();
    expect((globalThis as { prismaPool?: unknown }).prismaPool).toBeDefined();
    expect(console.info).toHaveBeenCalled();
  });

  it("switches to pooler candidate in hosted runtime when selected URL is not pooler", async () => {
    const { PoolMock } = await loadPrismaModule({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://user:pass@example.com:5432/postgres",
      DIRECT_URL: "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    });

    const poolConfig = PoolMock.mock.calls[0][0] as {
      connectionString: string;
      max: number;
      allowExitOnIdle: boolean;
    };

    expect(poolConfig.connectionString).toBe(
      "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    expect(poolConfig.max).toBe(1);
    expect(poolConfig.allowExitOnIdle).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("non-pooler URL"));

    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined();
    expect((globalThis as { prismaPool?: unknown }).prismaPool).toBeUndefined();
  });

  it("warns when DATABASE_URL is missing in hosted runtime and only DIRECT_URL is set", async () => {
    const { PoolMock } = await loadPrismaModule({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DIRECT_URL: "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      PRISMA_POOL_CONNECTION_TIMEOUT_MS: "-10",
    });

    const poolConfig = PoolMock.mock.calls[0][0] as {
      connectionString: string;
      connectionTimeoutMillis: number;
    };

    expect(poolConfig.connectionString).toBe(
      "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    // Invalid env value falls back to default.
    expect(poolConfig.connectionTimeoutMillis).toBe(10000);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL is missing"));
  });

  it("detects swapped Supabase direct/pooler envs and prefers pooler", async () => {
    const { PoolMock } = await loadPrismaModule({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://user:pass@db.abc123.supabase.co:5432/postgres",
      DIRECT_URL: "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    });

    const poolConfig = PoolMock.mock.calls[0][0] as { connectionString: string };

    expect(poolConfig.connectionString).toBe(
      "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("appear swapped"));
  });

  it("logs unknown host when database URL cannot be parsed", async () => {
    await loadPrismaModule({
      NODE_ENV: "development",
      DATABASE_URL: "not-a-valid-connection-string",
      PRISMA_LOG_CONNECTION_HOST: "1",
    });

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("host=unknown"));
  });

  it("warns when hosted runtime uses Supabase direct host", async () => {
    await loadPrismaModule({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://user:pass@db.abc123.supabase.co:5432/postgres",
    });

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("direct Supabase host"));
  });

  it("reports pool errors through adapter callback", async () => {
    const { PrismaPgMock } = await loadPrismaModule({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    });

    const adapterOptions = PrismaPgMock.mock.calls[0][1] as {
      onPoolError: (error: Error) => void;
    };
    const poolError = new Error("connection dropped");

    adapterOptions.onPoolError(poolError);

    expect(console.error).toHaveBeenCalledWith("Prisma pool error", poolError);
  });
});
