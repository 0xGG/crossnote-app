import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import { emojiSheetCells } from "./emoji-sheet.ts";
import { siteHeaders } from "./site-headers.ts";

// Build metadata shown in the Settings panel (replaces the legacy
// `yarn git-info` script that generated src/_git_commit.js).
function getGitCommit(): { logMessage: string; hash: string } {
  try {
    return {
      logMessage: execSync("git log -1 --oneline").toString().trim(),
      hash: execSync("git rev-parse HEAD").toString().trim(),
    };
  } catch {
    return { logMessage: "unknown", hash: "" };
  }
}

export default defineConfig({
  plugins: [react(), siteHeaders()],
  define: {
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
    __TWEMOJI_CELLS__: JSON.stringify(emojiSheetCells()),
    // Some browser bundles (PouchDB and friends) still reference the Node
    // `global` object; map it to the standard globalThis.
    global: "globalThis",
  },
  server: {
    port: 3000,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    // Unit tests sit next to the module they cover. The default glob would
    // also collect the Playwright specs under e2e/, which need a real
    // browser and run under their own runner.
    include: ["src/**/*.test.{ts,tsx}"],
    // Run in random order every time so order-independence stays an enforced
    // invariant rather than a one-off verification; Vitest prints the seed on
    // failure for reproduction.
    sequence: { shuffle: true },
  },
});
