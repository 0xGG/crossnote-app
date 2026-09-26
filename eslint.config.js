import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      // ESLint does not read .gitignore, so build output has to be listed
      // here even when nothing produces it any more: a leftover build/ from
      // the pre-Vite era would otherwise be linted (and blow the
      // --max-warnings ceiling) while staying invisible to git status.
      "build/",
      "coverage/",
      // Playwright's run artifacts (gitignored as well).
      "test-results/",
      "playwright-report/",
      // Same reason: local review tooling drops its scripts and captures
      // under .cache/ (gitignored), and they are not part of the code base.
      ".cache/",
      "public/",
      "patches/",
      ".pr-docs/",
      ".claude/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The compiler-grade rules introduced by eslint-plugin-react-hooks 7
      // flag many patterns in the legacy code base; downgrade them to
      // warnings until the UI-stack modernization round addresses them
      // (exhaustive-deps needs no entry - the preset already ships it at
      // "warn").
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      // tsconfig no longer loads @types/node for src, so these fail to type
      // check as well; the lint rule names the reason at the use site and
      // keeps guarding should a dependency's declarations ever pull the Node
      // globals back in (see the Buffer P1 of PR #283 for what a silent
      // dependency on a Node global costs in a browser bundle).
      "no-restricted-globals": [
        "error",
        ...["Buffer", "process", "global", "__dirname", "__filename"].map(
          (name) => ({
            name,
            message: `${name} is a Node global; browser code must not depend on it.`,
          }),
        ),
      ],
    },
  },
  {
    files: [
      "scripts/**/*.mjs",
      "*.config.js",
      "vite.config.ts",
      "playwright.config.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // The end-to-end specs run under Playwright in Node, but their
    // page.evaluate callbacks execute in the browser; the preset ships the
    // globals shared by both environments along with its rules.
    ...playwright.configs["flat/recommended"],
    files: ["e2e/**/*.ts"],
  },
  {
    files: ["e2e/**/*.ts"],
    rules: {
      // A spec may assert through a helper of its own, named expect...
      "playwright/expect-expect": [
        "warn",
        { assertFunctionPatterns: ["^expect[A-Z]"] },
      ],
    },
  },
  prettierConfig,
  {
    // Pragmatic relaxations for the legacy (2021-era) code base. Tighten
    // these as the code gets modernized; new code should not rely on them.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "no-useless-catch": "warn",
      "no-control-regex": "warn",
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },
);
