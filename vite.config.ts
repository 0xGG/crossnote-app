import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

// The echomd theme CSS is loaded at runtime by URL (see src/themes/manager.ts),
// versioned by the dependency spec string, e.g. /styles/echomd@^1.0.4/...
const echomdVersion: string = pkg.dependencies["@0xgg/echomd"];

// CodeMirror's language modes are loaded at runtime, one script per language,
// when a code block names one the bundle leaves out (see src/editor/index.ts).
// The site serves them itself, from the installed package under its version,
// e.g. /deps/codemirror@5.65.21/mode/shell/shell.js.
const codemirrorVersion: string = JSON.parse(
  readFileSync(
    new URL("./node_modules/codemirror/package.json", import.meta.url),
    "utf-8",
  ),
).version;
const codemirrorModes = `/deps/codemirror@${codemirrorVersion}/`;

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
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@0xgg/echomd/theme/*",
          dest: `styles/echomd@${echomdVersion}`,
        },
        {
          src: "node_modules/codemirror/mode/*/*.js",
          dest: `${codemirrorModes.slice(1)}mode`,
          // Each language keeps its own folder: the loader asks for
          // mode/<name>/<name>.js.
          rename: (name, extension, fullPath) =>
            `${basename(dirname(fullPath))}/${name}.${extension}`,
        },
      ],
    }),
  ],
  define: {
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
    __CODEMIRROR_MODES__: JSON.stringify(codemirrorModes),
    // Some browser bundles (PouchDB and friends) still reference the Node
    // `global` object; map it to the standard globalThis.
    global: "globalThis",
  },
  optimizeDeps: {
    // Scan from the source entry instead of index.html: the classic
    // <script src="/deps/..."> tags there point at large pre-minified
    // bundles in /public that stall the dependency scanner.
    entries: ["src/index.tsx"],
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
    // emoji-mart loaded as the bundle loads it, as ES modules: it unpacks its
    // emoji data in place as it loads, and only that way is the data it
    // unpacks the one the app reads (src/editor/emoji.ts).
    alias: [
      { find: /^emoji-mart$/, replacement: "emoji-mart/dist-es/index.js" },
    ],
    server: { deps: { inline: ["emoji-mart"] } },
  },
});
