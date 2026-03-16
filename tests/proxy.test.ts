import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieRecord = { name: string; value: string; options?: Record<string, unknown> };

function createRequest(pathname: string) {
  const cookies = {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  };

  const nextUrl = {
    pathname,
    clone: vi.fn(() => ({ pathname })),
  };

  return {
    cookies,
    nextUrl,
  };
}

async function loadProxyModule() {
  const getSupabaseConfig = vi.fn();
  const createServerClient = vi.fn();
  const next = vi.fn();
  const redirect = vi.fn();

  vi.doMock("@/lib/supabase/env", () => ({ getSupabaseConfig }));
  vi.doMock("@supabase/ssr", () => ({ createServerClient }));
  vi.doMock("next/server", () => ({
    NextResponse: {
      next,
      redirect,
    },
  }));

  const loadedModule = await import("@/proxy");

  return {
    ...loadedModule,
    getSupabaseConfig,
    createServerClient,
    next,
    redirect,
  };
}

describe("proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users from protected routes", async () => {
    const { proxy, getSupabaseConfig, createServerClient, next, redirect } =
      await loadProxyModule();

    const request = createRequest("/boards");
    const nextResponse = {
      cookies: {
        set: vi.fn(),
      },
    };

    getSupabaseConfig.mockReturnValue({ url: "https://example.supabase.co", anonKey: "anon" });
    next.mockReturnValue(nextResponse);
    redirect.mockImplementation((url: { pathname: string }) => ({ redirectedTo: url.pathname }));

    createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const result = await proxy(request as never);

    expect(result).toEqual({ redirectedTo: "/auth/sign-in" });
    expect(redirect).toHaveBeenCalled();
  });

  it("redirects authenticated users away from auth pages", async () => {
    const { proxy, getSupabaseConfig, createServerClient, next, redirect } =
      await loadProxyModule();

    const request = createRequest("/auth/sign-in");
    const nextResponse = {
      cookies: {
        set: vi.fn(),
      },
    };

    getSupabaseConfig.mockReturnValue({ url: "https://example.supabase.co", anonKey: "anon" });
    next.mockReturnValue(nextResponse);
    redirect.mockImplementation((url: { pathname: string }) => ({ redirectedTo: url.pathname }));

    createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
    });

    const result = await proxy(request as never);

    expect(result).toEqual({ redirectedTo: "/dashboard" });
    expect(redirect).toHaveBeenCalled();
  });

  it("returns next response for public unauthenticated route and syncs cookies", async () => {
    const { proxy, getSupabaseConfig, createServerClient, next } = await loadProxyModule();

    const request = createRequest("/");
    const responseCookiesSet = vi.fn();

    const nextResponseFactory = vi.fn(() => ({
      cookies: {
        set: responseCookiesSet,
      },
    }));

    next.mockImplementation(nextResponseFactory);

    getSupabaseConfig.mockReturnValue({ url: "https://example.supabase.co", anonKey: "anon" });

    createServerClient.mockImplementation(
      (
        _url: string,
        _anonKey: string,
        options: {
          cookies: {
            setAll: (cookies: CookieRecord[]) => void;
          };
        }
      ) => {
        options.cookies.setAll([{ name: "sb", value: "token", options: { path: "/" } }]);

        return {
          auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
          },
        };
      }
    );

    const result = await proxy(request as never);

    expect(next).toHaveBeenCalled();
    expect(request.cookies.set).toHaveBeenCalledWith("sb", "token");
    expect(responseCookiesSet).toHaveBeenCalledWith("sb", "token", { path: "/" });
    expect(result).toEqual({ cookies: { set: responseCookiesSet } });
  });
});
