import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "footer-max-line-length": [1, "always", 200],
    "body-max-line-length": [1, "always", 200],
  },
};

export default config;
