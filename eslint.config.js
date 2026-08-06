import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
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
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.js", "vite.config.ts"],
    languageOptions: {
      globals: globals.node,
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
