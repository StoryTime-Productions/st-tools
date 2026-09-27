import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    testTimeout: 15000,
    pool: "threads",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["node_modules", ".next"],
    passWithNoTests: false,
    // .ts tests (actions, loaders, helpers) skip jsdom; a file that needs the DOM opts in
    // with a `// @vitest-environment jsdom` comment.
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["tests/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "tests/**",
        "**/*.config.{ts,js,mjs}",
        "**/*.d.ts",
        "src/app/layout.tsx",
        "prisma/**",
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/server-only.ts"),
    },
  },
});
