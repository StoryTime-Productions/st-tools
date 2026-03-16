import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function loadProvidersModule(nodeEnv: string) {
  const getQueryClient = vi.fn(() => ({ id: "query-client" }));

  const themeProvider = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ));

  const queryClientProvider = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-client-provider">{children}</div>
  ));

  const reactQueryDevtools = vi.fn(() => <div data-testid="react-query-devtools" />);

  vi.stubEnv("NODE_ENV", nodeEnv);

  vi.doMock("@/lib/query-client", () => ({ getQueryClient }));
  vi.doMock("next-themes", () => ({ ThemeProvider: themeProvider }));
  vi.doMock("@tanstack/react-query", () => ({ QueryClientProvider: queryClientProvider }));
  vi.doMock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: reactQueryDevtools }));

  const providersModule = await import("@/components/providers");

  return {
    ...providersModule,
    getQueryClient,
    themeProvider,
    queryClientProvider,
    reactQueryDevtools,
  };
}

describe("Providers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    if (typeof ORIGINAL_NODE_ENV === "string") {
      vi.stubEnv("NODE_ENV", ORIGINAL_NODE_ENV);
    }
    vi.unstubAllEnvs();
  });

  it("renders children and devtools in development", async () => {
    const {
      default: Providers,
      getQueryClient,
      queryClientProvider,
      reactQueryDevtools,
    } = await loadProvidersModule("development");

    render(
      <Providers>
        <p>App content</p>
      </Providers>
    );

    expect(getQueryClient).toHaveBeenCalled();
    expect(queryClientProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        client: { id: "query-client" },
      }),
      undefined
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.getByTestId("react-query-devtools")).toBeInTheDocument();
    expect(reactQueryDevtools).toHaveBeenCalledWith({ initialIsOpen: false }, undefined);
  });

  it("does not render devtools outside development", async () => {
    const { default: Providers } = await loadProvidersModule("test");

    render(
      <Providers>
        <p>App content</p>
      </Providers>
    );

    expect(screen.queryByTestId("react-query-devtools")).not.toBeInTheDocument();
  });
});
