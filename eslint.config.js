import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // apps/web (the web app) is linted with the rest — it shares this
  // toolkit and is built and deployed by deploy.yml.
  // apps/desktop is a Python app; its .venv contains vendored JS, and its
  // i18n/*.ts files are Qt Linguist XML translation files, not TypeScript.
  { ignores: ["dist", "apps/web/dist*", "apps/desktop"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Disable some TypeScript-specific rules that are noisy or incompatible
      // with our current ESLint setup. The base `no-unused-expressions` rule
      // from ESLint is still active via `js.configs.recommended`.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  }
);
