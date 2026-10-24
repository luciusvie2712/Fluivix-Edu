import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
export default ts.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/schema.d.ts",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["apps/mobile/__tests__/**/*.tsx"],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
