import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const egressOnlyMessage =
  "Use @moneytrack/egress egressFetch — direct outbound HTTP is banned outside packages/egress.";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: egressOnlyMessage,
        },
      ],
    },
  },
  {
    // An underscore prefix is how this repo marks a binding it must declare but
    // deliberately ignores: an unused adapter parameter, a destructured field
    // kept for documentation. Flagging those adds noise, not safety.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    // Plain Node scripts: no tsconfig lib to pull these in, so declare them.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        performance: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // Served straight to the browser, so it has no tsconfig dom lib behind it.
    files: ["apps/web/public/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        localStorage: "readonly",
        window: "readonly",
      },
    },
  },
  {
    // A hook called after an early return crashed the credit page in production (React #310).
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // 3 existing warnings (bank-summary, bank-transactions, category-chooser); off until fixed without behavior change.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["packages/egress/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    // Add-on init scripts call the local Supervisor API only (not bank egress).
    files: ["ha-addon/**/*.mjs"],
    languageOptions: {
      globals: {
        fetch: "readonly",
      },
    },
    rules: {
      "no-restricted-globals": "off",
    },
  },
);
