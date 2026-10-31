// R3-0 prototype, not for main: runs the risk check specs in the bundled
// Chromium and in the installed Chrome. R3_BASE_URL points them at a build
// already being served (the CodeMirror 5 build from main, for the latency
// comparison); without it the CodeMirror 6 build is served as usual.
import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const baseURL = process.env.R3_BASE_URL;

export default defineConfig({
  ...base,
  testMatch: /r3-0-.*\.spec\.ts/,
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.R3_JSON ?? "test-results/r3-0.json" }],
  ],
  use: { ...base.use, ...(baseURL ? { baseURL } : {}) },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: baseURL ? undefined : base.webServer,
});
