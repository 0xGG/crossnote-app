// Downloads the twemoji sprite sheet used by the emoji-mart picker and the
// editor emoji rendering (see src/components/EmojiWrapper.tsx) into
// public/assets/emoji/. Replaces the legacy `download-emoji-sheet.js`, which
// depended on the abandoned `request` package.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  EmojiDefaultProps,
} = require("emoji-mart/dist/utils/shared-default-props");

const SHEET_SIZE = 64;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
// --dry-run resolves the emoji-mart internals and the sheet URL, then stops
// before the network. CI uses it to catch the fragile part of this script (the
// deep import above, which any emoji-mart upgrade can break) without making
// the pipeline depend on a CDN.
const dryRun = process.argv.includes("--dry-run");

async function downloadSheet(size) {
  const url = EmojiDefaultProps.backgroundImageFn("twitter", size);
  const targetFile = path.join(
    projectRoot,
    "public",
    "assets",
    "emoji",
    "twitter",
    `${size}.png`,
  );
  if (dryRun) {
    console.log(`Resolved the sheet URL: ${url} (would write ${targetFile})`);
    return;
  }
  if (existsSync(targetFile)) {
    return;
  }
  console.log(`Downloading ${url} to ${targetFile}`);
  try {
    // Bound the fetch: a stalled connection would otherwise hang the build
    // forever instead of reaching the warn-and-continue path below.
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Response status was ${response.status}`);
    }
    await mkdir(path.dirname(targetFile), { recursive: true });
    await writeFile(targetFile, Buffer.from(await response.arrayBuffer()));
    console.log(`Downloaded ${url}`);
  } catch (error) {
    // The sheet only affects emoji picker rendering; never fail the build.
    console.warn(`Failed to download the emoji sheet: ${error.message}`);
  }
}

await downloadSheet(SHEET_SIZE);
