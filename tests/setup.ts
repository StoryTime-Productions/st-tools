import "@testing-library/jest-dom";
import { vi } from "vitest";

// `after()` throws outside a request; actions that signal live updates call it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
