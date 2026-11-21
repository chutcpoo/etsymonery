import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  {
    files: [".github/scripts/*.mjs", "tests/*.mjs", "tests/*.cjs"],
    languageOptions: { globals: {
      process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly",
      URLSearchParams: "readonly", Response: "readonly", require: "readonly"
    } }
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-extra-boolean-cast": "off",
      "no-useless-escape": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs"
    ]
  }
);
