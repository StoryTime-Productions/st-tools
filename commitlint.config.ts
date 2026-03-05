import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Enforce Refs: #N or Closes: #N footer on every commit
    "footer-max-line-length": [1, "always", 200],
    "body-max-line-length": [1, "always", 200],
  },
  plugins: [
    {
      rules: {
        "require-issue-ref": ({ footer }: { footer: string | null }) => {
          const hasRef = /^(Refs|Closes|Fixes|Resolves): #\d+/m.test(footer ?? "");
          return [
            hasRef,
            "Commit footer must include 'Refs: #N' or 'Closes: #N' referencing an existing issue.",
          ];
        },
      },
    },
  ],
};

export default config;
