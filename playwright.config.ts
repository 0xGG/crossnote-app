import { defineConfig, devices } from "@playwright/test";

// The suite drives the production build served by `vite preview`, not the
// dev server: bundling is part of what it guards (the echomd UMD wrapper is
// the kind of thing only the built output exercises). `pnpm test:e2e` builds
// first; while iterating on specs, `pnpm exec playwright test` reuses the
// existing dist/ and a preview server that is already listening.
const port = 4173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // A stray test.only would silently shrink the suite in CI.
  forbidOnly: !!process.env.CI,
  // One retry in CI: a transient failure then yields a trace to diagnose
  // instead of a red run, and Playwright still reports the test as flaky
  // rather than passed, so the signal is not lost.
  retries: process.env.CI ? 1 : 0,
  reporter: [
    process.env.CI ? ["github"] : ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
