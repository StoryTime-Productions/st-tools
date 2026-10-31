import type { UserConfig } from "@commitlint/types";

// GitHub appends " (#123)" to a squash-merge title. The author did not type that suffix, so the
// 100 character header limit is measured without it. (A release PR lints every commit since
// master, including squash commits that are already merged and cannot be reworded.)
const SQUASH_SUFFIX = / \(#\d+\)$/;

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "header-max-length-without-pr-number": (parsed, _when, value) => {
          const limit = typeof value === "number" ? value : 100;
          const header = (parsed.header ?? "").replace(SQUASH_SUFFIX, "");
          return [
            header.length <= limit,
            `header must not be longer than ${limit} characters, current length is ${header.length} (not counting a trailing (#123))`,
          ];
        },
      },
    },
  ],
  rules: {
    "header-max-length": [0],
    "header-max-length-without-pr-number": [2, "always", 100],
    "footer-max-line-length": [1, "always", 200],
    "body-max-line-length": [1, "always", 200],
  },
};

export default config;
