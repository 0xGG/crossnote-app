import { ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { APIRequestContext, Page } from "@playwright/test";
import { unzipSync } from "fflate";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  localBytes,
  remoteBytes,
  upload,
  fixtureURL,
  type FileHost,
} from "./git";

// Real git starts several processes and can wait behind other fixture users.
// Keep completion bounded, and retain the failure's network and UI evidence.
test.describe.configure({ timeout: 60000 });

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

const browserEvents = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const events: string[] = [];
  browserEvents.set(page, events);
  page.on("pageerror", (error) => events.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") events.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(fixtureURL))
      events.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
  });
  page.on("requestfailed", (request) =>
    events.push(`failed: ${request.url()} ${request.failure()?.errorText}`),
  );
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("git-browser-events", {
      body: (browserEvents.get(page) ?? []).join("\n"),
      contentType: "text/plain",
    });
});

const advertisement = "**/info/refs?service=git-upload-pack";

async function moveDuringDownload(
  app: CrossnoteApp,
  request: APIRequestContext,
  action: () => Promise<void>,
) {
  const remote = await createRemote(request, { "Story.md": bytes("Base") });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("Story", { exact: true }).click();
  await app.modeButton("Edit").click();
  await app.setEditorText("Local story", app.visibleEditor);
  await expect
    .poll(() => app.storedText(`${dir}/Story.md`))
    .toContain("Local story");
  await changeRemote(request, remote, {
    "Story.md": null,
    "Story.md/chapter.md": bytes("Remote chapter"),
  });
  const meta = await (
    await request.get(`${fixtureURL}/repos/${remote.id}`)
  ).json();
  const moved = `Story.local-${meta.sha.slice(0, 8)}`;
  const messages = await whileDownloading(app, remote.id, action);
  await expect(app.tab(moved)).toHaveAttribute("aria-selected", "true");
  return { dir, moved, messages };
}

async function whileDownloading(
  app: CrossnoteApp,
  notebook: string,
  action: () => Promise<void>,
) {
  const page = app.page;
  // Hold the fetch until the user's edit or rename has been dispatched.
  const messages = await app.recordMessages();
  const fetchStarted = page.waitForRequest(advertisement);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    advertisement,
    async (route) => {
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  await app
    .notebook(notebook)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  try {
    await fetchStarted;
    await action();
  } finally {
    release();
  }
  return messages;
}

test("keeps the editor and queued typing with a note moved during Download", async ({
  app,
  page,
  request,
}) => {
  const { dir, moved } = await moveDuringDownload(app, request, async () => {
    await app.visibleEditor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" queued");
  });
  await expect
    .poll(() => app.storedText(`${dir}/${moved}.md`))
    .toContain("Local story queued");
  expect(await app.editorText(app.visibleEditor)).toBe("Local story queued");
  expect(await localBytes(page, `${dir}/Story.md/chapter.md`)).toEqual(
    bytes("Remote chapter"),
  );
  await page.reload();
  await app.waitUntilReady();
  await expect(app.tab(moved)).toHaveAttribute("aria-selected", "true");
  await expect(app.preview).toContainText("Local story queued");
});

test.describe("recovery notes", () => {
  const directory = ".crossnote-recovered";
  const story = `${directory}/Story.md`;
  const markerPath = `${directory}/.gitignore`;
  const marker = bytes("# Crossnote recovered files\n*\n!Future.md\n");
  const guide = bytes(`See [[${directory}/Story]]`);
  const editedGuide = bytes(`Updated guide: [[${directory}/Story]]`);
  const published = bytes("Published story\n");
  const publicRules = bytes("# Public notebook files\n*.tmp\n");
  const savedText = "Story draft with an ending";
  const extraText = " typed during Download";

  async function startUpload(app: CrossnoteApp, id: string) {
    await app
      .notebook(id)
      .getByRole("treeitem", { name: /Upload/ })
      .click();
    await app.page
      .getByRole("dialog")
      .getByRole("button", { name: "Upload", exact: true })
      .click();
  }

  for (const {
    action,
    firstSync,
    checkBackup,
    startSync,
    retry,
    expectedRemoteGuide,
  } of [
    {
      action: "Download",
      firstSync: (
        app: CrossnoteApp,
        id: string,
        path: string,
        savedDraft: number[],
      ) =>
        whileDownloading(app, id, async () => {
          await app.visibleEditor.click();
          await app.page.keyboard.press("Control+End");
          await app.page.keyboard.type(extraText);
          expect(await app.editorText(app.visibleEditor)).toBe(
            savedText + extraText,
          );
          expect(await localBytes(app.page, path)).toEqual(savedDraft);
        }),
      checkBackup: (draft: number[]) => {
        const file = new TextDecoder().decode(Uint8Array.from(draft));
        // The fixture starts without front matter. Its first save adds two timestamps.
        const settings = /^---\ncreated: \S+\nmodified: \S+\n---\n/;
        expect(file).toMatch(settings);
        expect(file.replace(settings, "")).toBe(savedText + extraText);
      },
      startSync: (app: CrossnoteApp, id: string) =>
        app
          .notebook(id)
          .getByRole("treeitem", { name: /Download/ })
          .click(),
      retry: download,
      expectedRemoteGuide: guide,
    },
    {
      action: "Upload",
      firstSync: startUpload,
      checkBackup: (draft: number[], savedDraft: number[]) =>
        expect(draft).toEqual(savedDraft),
      startSync: startUpload,
      retry: upload,
      expectedRemoteGuide: editedGuide,
    },
  ]) {
    test(`pauses ${action} for a recovery backup and completes on manual retry`, async ({
      app,
      page,
      request,
    }) => {
      const remote = await createRemote(request, {
        ".gitignore": publicRules,
        "Guide.md": guide,
      });
      await app.open();
      const dir = await cloneRemote(app, remote);
      await localBytes(page, `${dir}/Guide.md`, editedGuide);
      await localBytes(page, `${dir}/${markerPath}`, marker);
      await localBytes(page, `${dir}/${story}`, bytes("Story draft"));
      await app.noteCards.getByText("Guide", { exact: true }).click();
      await app.preview
        .getByRole("link", { name: `${directory}/Story` })
        .click();
      await expect(app.preview.filter({ visible: true })).toContainText(
        "Story draft",
      );
      await app.modeButton("Edit").click();
      await app.setEditorText(savedText, app.visibleEditor);
      await expect
        .poll(() => app.storedText(`${dir}/${story}`))
        .toContain(savedText);
      const savedDraft = await localBytes(page, `${dir}/${story}`);
      await changeRemote(request, remote, {
        [story]: published,
        [markerPath]: publicRules,
      });

      const paused = page.getByRole("dialog", { name: "Sync paused" });
      const confirm = paused.getByRole("button", { name: "I saved the files" });
      async function requestBackup() {
        await expect(paused).toContainText(directory);
        await expect(confirm).toBeDisabled();
        expect(await localBytes(page, `${dir}/${markerPath}`)).toEqual(marker);
        expect(await remoteBytes(request, remote, "Guide.md")).toEqual(guide);
        const downloaded = page.waitForEvent("download");
        await paused
          .getByRole("button", { name: "Download recovery files" })
          .click();
        const zip = await (await downloaded).path();
        ok(zip, "Recovery ZIP has no local download path");
        const files = unzipSync(await readFile(zip));
        const draft = [...files[story]];
        expect(draft).toEqual(await localBytes(page, `${dir}/${story}`));
        expect([...files[markerPath]]).toEqual(marker);
        await expect(confirm).toBeEnabled();
        return draft;
      }

      await firstSync(app, remote.id, `${dir}/${story}`, savedDraft);
      const draft = await requestBackup();
      checkBackup(draft, savedDraft);
      await confirm.click();
      await expect(paused.getByRole("alert")).toContainText(/close/i);
      await expect(paused.getByRole("alert")).toContainText(/note/i);
      expect(await localBytes(page, `${dir}/${story}`)).toEqual(draft);
      expect(await localBytes(page, `${dir}/${markerPath}`)).toEqual(marker);
      await paused.getByRole("button", { name: "Close", exact: true }).click();
      const tab = app.tab("Story");
      await tab.locator(".flexlayout__tab_button_trailing").click();
      await expect(tab).toHaveCount(0);
      await app.openNotes(remote.id);
      const storyCard = app.noteCards.getByText("Story", { exact: true });
      const guideCard = app.noteCards.getByText("Guide", { exact: true });
      await expect(guideCard).toBeVisible();
      await expect(storyCard).toBeVisible();

      await startSync(app, remote.id);
      expect(await requestBackup()).toEqual(draft);
      await confirm.click();
      await expect(paused).toBeHidden();
      await expect(guideCard).toBeVisible();
      await expect(storyCard).toHaveCount(0);
      expect(await app.storedText(`${dir}/${story}`)).toBeUndefined();
      await retry(app, remote);

      await page.reload();
      await app.waitUntilReady();
      expect(await localBytes(page, `${dir}/${story}`)).toEqual(published);
      expect(await localBytes(page, `${dir}/${markerPath}`)).toEqual(
        publicRules,
      );
      expect(await remoteBytes(request, remote, story)).toEqual(published);
      expect(await remoteBytes(request, remote, markerPath)).toEqual(
        publicRules,
      );
      expect(await remoteBytes(request, remote, "Guide.md")).toEqual(
        expectedRemoteGuide,
      );
      const head = await (
        await request.get(`${fixtureURL}/repos/${remote.id}`)
      ).json();
      expect(head.files.sort()).toEqual(
        [markerPath, story, ".gitignore", "Guide.md"].sort(),
      );
    });
  }
});

for (const { name, rename } of [
  {
    name: "title",
    rename: async (app: CrossnoteApp) => {
      await app.noteTitle.fill("Renamed");
      await app.noteTitle.press("Enter");
    },
  },
  {
    name: "path dialog",
    rename: async (app: CrossnoteApp) => {
      await app.page.getByRole("button", { name: "Note menu" }).click();
      await app.page.getByRole("button", { name: "Change file path" }).click();
      const dialog = app.page.getByRole("dialog");
      await dialog.getByRole("textbox").fill("Renamed");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    },
  },
]) {
  test(`reports the new path when a rename from the ${name} waits behind Download`, async ({
    app,
    request,
  }) => {
    const { dir, moved, messages } = await moveDuringDownload(
      app,
      request,
      () => rename(app),
    );
    await expect
      .poll(messages)
      .toContain(`The note moved to ${moved}.md. Open it there and try again.`);
    expect(await app.storedText(`${dir}/Renamed.md`)).toBeUndefined();
  });
}

async function advertiseEmptyRemote(page: Page) {
  await page.route(advertisement, (route) =>
    route.fulfill({
      contentType: "application/x-git-upload-pack-advertisement",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "001e# service=git-upload-pack\n00000000",
    }),
  );
}

test("downloads the first remote commit and uploads a note made in the empty clone", async ({
  app,
  page,
  request,
}) => {
  const first = bytes("First remote commit\n");
  const remote = await createRemote(request, { "remote.md": first });
  await advertiseEmptyRemote(page);
  await app.open();
  const dir = await cloneRemote(app, remote);
  const title = await app.createNote();
  await app.typeInEditor("Saved before the first remote commit");
  await page.unroute(advertisement);
  await download(app, remote);
  expect(await localBytes(page, `${dir}/remote.md`)).toEqual(first);
  await upload(app, remote);
  expect(
    new TextDecoder().decode(
      new Uint8Array(await remoteBytes(request, remote, title + ".md")),
    ),
  ).toContain("Saved before the first remote commit");
  expect(await remoteBytes(request, remote, "remote.md")).toEqual(first);
});

test("retries the same commit after an upload failure, reload and download", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, { "README.md": bytes("Base\n") });
  const remoteHead = async () =>
    (await (await request.get(`${fixtureURL}/repos/${remote.id}`)).json()).sha;
  const base = await remoteHead();
  await app.open();
  const dir = await cloneRemote(app, remote);
  const ref = `${dir}/.git/refs/heads/master`;
  const edited = bytes("Saved before uploading\r\n");
  await localBytes(page, `${dir}/README.md`, edited);
  let attempted = "";
  await page.route(
    "**/git-receive-pack",
    async (route) => {
      attempted = new TextDecoder()
        .decode(new Uint8Array(await localBytes(page, ref)))
        .trim();
      await route.abort("failed");
    },
    { times: 1 },
  );
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Upload", exact: true })
    .click();
  await expect.poll(messages).toContain("Failed to upload notebook");
  expect(attempted).toMatch(/^[0-9a-f]{40}$/);
  expect(attempted).not.toBe(base);
  expect(await remoteHead()).toBe(base);
  expect((await app.storedText(ref))?.trim()).toBe(attempted);

  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await download(app, remote, "Local commits are waiting to be uploaded.");
  expect((await app.storedText(ref))?.trim()).toBe(attempted);
  expect(await localBytes(page, `${dir}/README.md`)).toEqual(edited);
  await upload(app, remote);
  expect(await remoteHead()).toBe(attempted);
  expect(await remoteBytes(request, remote, "README.md")).toEqual(edited);
});

test("explains an empty remote and retries the download without losing a local edit", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, { "README.md": bytes("Base\n") });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const edited = bytes("Local edit\n");
  await localBytes(page, `${dir}/README.md`, edited);

  await advertiseEmptyRemote(page);
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  await expect
    .poll(messages)
    .toContain("The remote repository has no commits yet.");
  await page.unroute(advertisement);
  await page.reload();
  await app.waitUntilReady();
  await expect(app.notebook(remote.id)).toBeVisible();
  expect(await localBytes(page, `${dir}/README.md`)).toEqual(edited);

  await app.openNotes(remote.id);
  await changeRemote(request, remote, { "new.md": bytes("Remote addition\n") });
  await download(app, remote);
  expect(await localBytes(page, `${dir}/README.md`)).toEqual(edited);
  expect(await localBytes(page, `${dir}/new.md`)).toEqual(
    bytes("Remote addition\n"),
  );
});

test("clones, merges text and pushes a note created from a nested link", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Start\n\n[[nested/Child]]\n\nEnd\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.expectStored(`${dir}/README.md`);
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.preview.getByRole("link", { name: "nested/Child" }).click();
  await expect(app.tab("Child")).toHaveAttribute("aria-selected", "true");
  await expect(app.visibleEditor).toBeVisible();
  await app.visibleEditor.click();
  await page.keyboard.type("From a link");
  await upload(app, remote);
  expect(
    new TextDecoder().decode(
      new Uint8Array(await remoteBytes(request, remote, "nested/Child.md")),
    ),
  ).toContain("From a link");
  await changeRemote(request, remote, {
    "README.md": bytes("# Remote\n\n[[nested/Child]]\n\nEnd\n"),
  });
  await localBytes(
    page,
    `${dir}/README.md`,
    bytes("# Start\n\n[[nested/Child]]\n\nLocal end\n"),
  );
  await download(app, remote);
  const merged = new TextDecoder().decode(
    new Uint8Array(await localBytes(page, `${dir}/README.md`)),
  );
  expect(merged).toContain("# Remote");
  expect(merged).toContain("Local end");
  await app.expectStored(`${dir}/README.md`);
});

test("preserves modified attachment bytes through pull, push and a fresh clone", async ({
  app,
  page,
  request,
  browser,
}) => {
  const original = [137, 80, 78, 71, 0, 255, 128, 13, 10];
  const edited = [137, 80, 78, 71, 0, 254, 129, 13, 10, 42];
  const remote = await createRemote(request, {
    "README.md": bytes("# Binary\n"),
    "assets/image.png": original,
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  expect(await localBytes(page, `${dir}/assets/image.png`)).toEqual(original);
  await localBytes(page, `${dir}/assets/image.png`, edited);
  await download(app, remote, "No new commits to download");
  expect(await remoteBytes(request, remote, "assets/image.png")).toEqual(
    original,
  );
  expect(await localBytes(page, `${dir}/assets/image.png`)).toEqual(edited);
  await upload(app, remote);
  expect(await remoteBytes(request, remote, "assets/image.png")).toEqual(
    edited,
  );
  // A separate browser storage, not another tab sharing the original fs.
  const fresh = await browser.newContext();
  try {
    await fresh.addInitScript(() =>
      localStorage.setItem("settings/language", "en-US"),
    );
    const nextPage = await fresh.newPage();
    const { CrossnoteApp } = await import("./crossnote");
    const next = new CrossnoteApp(nextPage);
    await nextPage.goto(new URL("/", page.url()).href);
    await next.waitUntilReady();
    const nextDir = await cloneRemote(next, remote);
    expect(await localBytes(nextPage, `${nextDir}/assets/image.png`)).toEqual(
      edited,
    );
  } finally {
    await fresh.close();
  }
});

test("blocks a download when a BOM-prefixed nested rule would expose a local file", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    ".gitignore": bytes("sample.txt\n"),
    "assets/tracked.md": bytes("Base"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const file = "assets/sample.txt";
  await localBytes(page, `${dir}/${file}`, bytes("fixture"));
  await changeRemote(request, remote, {
    "assets/.gitignore": bytes("\uFEFF!sample.txt\n"),
    "assets/tracked.md": bytes("Incoming"),
  });
  await download(
    app,
    remote,
    `Sync conflicts: ${file}. Your changes were kept. Review the files before uploading again.`,
  );
  expect(await localBytes(page, `${dir}/assets/tracked.md`)).toEqual(
    bytes("Base"),
  );
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(bytes("fixture"));
});

test("keeps both binary conflicts and stops the upload with their paths", async ({
  app,
  page,
  request,
}) => {
  const original = [0, 255, 128];
  const ours = [0, 254, 129];
  const theirs = [0, 253, 130];
  const remote = await createRemote(request, {
    "README.md": bytes("# Conflict\n"),
    "assets/a.bin": original,
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await localBytes(page, `${dir}/assets/a.bin`, ours);
  await changeRemote(request, remote, { "assets/a.bin": theirs });
  const before = await (
    await request.get(`${fixtureURL}/repos/${remote.id}`)
  ).json();
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Upload", exact: true })
    .click();
  await expect
    .poll(messages)
    .toContainEqual(expect.stringContaining("Sync conflicts: assets/a.bin"));
  expect(await localBytes(page, `${dir}/assets/a.bin`)).toEqual(ours);
  expect(
    await localBytes(
      page,
      `${dir}/assets/a.remote-${before.sha.slice(0, 8)}.bin`,
    ),
  ).toEqual(theirs);
  expect(
    (await (await request.get(`${fixtureURL}/repos/${remote.id}`)).json()).sha,
  ).toBe(before.sha);
  // An explicit later upload can publish both preserved versions.
  await upload(app, remote);
  expect(await remoteBytes(request, remote, "assets/a.bin")).toEqual(ours);
  expect(
    await remoteBytes(
      request,
      remote,
      `assets/a.remote-${before.sha.slice(0, 8)}.bin`,
    ),
  ).toEqual(theirs);
});

test("downloads a file replacing a directory after an ignored tracked edit stops upload", async ({
  app,
  page,
  request,
}) => {
  const original = [137, 80, 0, 255, 128];
  const edit = [137, 80, 0, 254, 129];
  const draft = [0, 10, 255, 251];
  const replacement = [0, 253, 130, 10];
  const remote = await createRemote(request, {
    "README.md": bytes("# Directory replacement\n"),
    "assets/a.bin": original,
  });
  const remoteState = async () => {
    const response = await request.get(`${fixtureURL}/repos/${remote.id}`);
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as { sha: string; files: string[] };
  };

  await app.open();
  const dir = await cloneRemote(app, remote);
  const branch = `${dir}/.git/refs/heads/master`;
  await changeRemote(request, remote, {
    ".gitignore": bytes("assets/a.bin\nassets/private.bin\n"),
  });
  const ignored = await remoteState();
  await download(app, remote);
  expect((await app.storedText(branch))?.trim()).toBe(ignored.sha);
  await localBytes(page, `${dir}/assets/a.bin`, edit);
  await localBytes(page, `${dir}/assets/private.bin`, draft);

  const uploadRequests: string[] = [];
  const observeRequest = (request: { url(): string }) => {
    uploadRequests.push(request.url());
  };
  page.on("request", observeRequest);
  const uploadMessages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect
    .poll(uploadMessages, { timeout: 20000 })
    .toContainEqual(
      expect.stringContaining(
        "Upload paused because assets/a.bin matches a Git ignore rule",
      ),
    );
  page.off("request", observeRequest);
  expect(uploadRequests).not.toContainEqual(
    expect.stringMatching(/\/git-receive-pack$/),
  );
  expect(await remoteState()).toEqual(ignored);
  expect(await remoteBytes(request, remote, "assets/a.bin")).toEqual(original);

  await changeRemote(request, remote, {
    "assets/a.bin": null,
    "assets": replacement,
  });
  const incoming = await remoteState();
  const suffix = incoming.sha.slice(0, 8);
  const movedEdit = `.crossnote-recovered/a.local-${suffix}.bin`;
  const movedDraft = `.crossnote-recovered/private.local-${suffix}.bin`;
  const fetch = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${remote.proxy}/`) &&
      response.url().endsWith(`/git/${remote.id}.git/git-upload-pack`) &&
      response.request().method() === "POST",
  );
  const downloadMessages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  expect((await fetch).ok()).toBe(true);
  await expect
    .poll(downloadMessages, { timeout: 20000 })
    .toContainEqual(expect.stringMatching(/Sync conflicts:.*assets\/a\.bin/));

  const expectRecovered = async () => {
    expect((await app.storedText(branch))?.trim()).toBe(incoming.sha);
    expect(await localBytes(page, `${dir}/assets`)).toEqual(replacement);
    expect(await localBytes(page, `${dir}/${movedEdit}`)).toEqual(edit);
    expect(await localBytes(page, `${dir}/${movedDraft}`)).toEqual(draft);
  };
  await expectRecovered();
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await expectRecovered();

  // Move the recovered tracked edit out of the ignored location to publish it.
  await page.evaluate(
    async ({ dir, movedEdit }) => {
      const fs = (window as unknown as FileHost).pfs as FileHost["pfs"] & {
        rename(source: string, target: string): Promise<void>;
      };
      await fs.rename(`${dir}/${movedEdit}`, `${dir}/recovered.bin`);
      await fs.storeTree(dir);
    },
    { dir, movedEdit },
  );
  await upload(app, remote);
  const published = await remoteState();
  expect(published.sha).not.toBe(incoming.sha);
  expect((await app.storedText(branch))?.trim()).toBe(published.sha);
  expect(published.files).toEqual([
    ".gitignore",
    "README.md",
    "assets",
    "recovered.bin",
  ]);
  expect(await remoteBytes(request, remote, "recovered.bin")).toEqual(edit);
  expect(await localBytes(page, `${dir}/${movedDraft}`)).toEqual(draft);
});

test("reports which side deleted conflicting files while retaining modified bytes", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Deletions\n"),
    "local.bin": [0, 1],
    "remote.bin": [0, 1],
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await page.evaluate(
    async (file) => (window as unknown as FileHost).pfs.unlink(file),
    `${dir}/local.bin`,
  );
  await localBytes(page, `${dir}/remote.bin`, [0, 2]);
  await changeRemote(request, remote, {
    "local.bin": [0, 3],
    "remote.bin": null,
  });
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Upload", exact: true })
    .click();
  await expect
    .poll(messages)
    .toContainEqual(
      expect.stringContaining(
        "local.bin (deleted locally, remote changes kept)",
      ),
    );
  await expect
    .poll(messages)
    .toContainEqual(
      expect.stringContaining(
        "remote.bin (deleted remotely, local changes kept)",
      ),
    );
  expect(await localBytes(page, `${dir}/local.bin`)).toEqual([0, 3]);
  expect(await localBytes(page, `${dir}/remote.bin`)).toEqual([0, 2]);
});

test("recovers bytes from an interrupted pull on reload without duplicating a conflict copy", async ({
  app,
  page,
  request,
}) => {
  const ours = [0, 254, 129];
  const theirs = [0, 253, 130];
  const remote = await createRemote(request, {
    "README.md": bytes("# Recovery\n"),
    "assets/a.bin": [0, 255, 128],
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await localBytes(page, `${dir}/assets/a.bin`, ours);
  await changeRemote(request, remote, { "assets/a.bin": theirs });
  const head = await (
    await request.get(`${fixtureURL}/repos/${remote.id}`)
  ).json();
  await page.evaluate(() => {
    const fs = (window as unknown as FileHost).pfs;
    const write = fs.writeFile.bind(fs);
    fs.writeFile = async (file, data) => {
      if (file.includes(".remote-")) throw new Error("Simulated disk failure");
      await write(file, data);
    };
  });
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  await expect.poll(messages).toContain("Failed to download notebook");
  // The original is removed deliberately, so only the recovery record can
  // bring our bytes back after checkout has replaced the working copy.
  await page.evaluate(async (file) => {
    const fs = (window as unknown as FileHost).pfs;
    await fs.unlink(file);
    await fs.storeTree(file);
  }, `${dir}/assets/a.bin`);
  await page.reload();
  await app.waitUntilReady();
  await expect(app.notebook(remote.id)).toBeVisible();
  expect(await localBytes(page, `${dir}/assets/a.bin`)).toEqual(ours);
  const copy = `a.remote-${head.sha.slice(0, 8)}.bin`;
  expect(await localBytes(page, `${dir}/assets/${copy}`)).toEqual(theirs);
  expect(
    await page.evaluate(
      async (dir) =>
        (
          await (window as unknown as FileHost).pfs.readdir(`${dir}/assets`)
        ).filter((file) => file.includes(".remote-")),
      dir,
    ),
  ).toEqual([copy]);
  await app.expectStored(`${dir}/assets/${copy}`);
});

test("finishing a cancelled upload does not close another notebook's upload dialog", async ({
  app,
  page,
  request,
}) => {
  const a = await createRemote(request, { "README.md": bytes("A\n") });
  const b = await createRemote(request, { "README.md": bytes("B\n") });
  await app.open();
  const dir = await cloneRemote(app, a);
  await cloneRemote(app, b);
  // The cloned notebooks are ready. Observe the upload in a fresh queue.
  await page.reload();
  await app.waitUntilReady();
  await app.expandNotebook(a.id);
  await app.expandNotebook(b.id);
  await localBytes(page, `${dir}/README.md`, bytes("Changed A\n"));
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (reached = resolve));
  await page.route("**/git-receive-pack", async (route) => {
    reached();
    await held;
    await route.continue();
  });
  try {
    await app
      .notebook(a.id)
      .getByRole("treeitem", { name: /Upload/ })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await started;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await app
      .notebook(b.id)
      .getByRole("treeitem", { name: /Upload/ })
      .click();
    await expect(dialog).toContainText(b.id);
    const bMessage = dialog.getByRole("textbox", { name: "Commit message" });
    await bMessage.fill("Draft upload for B");
    await page.evaluate((notebookDir) => {
      const { pfs } = window as unknown as FileHost;
      const storeTree = pfs.storeTree;
      pfs.storeTree = async (dir) => {
        if (dir === notebookDir) {
          pfs.storeTree = storeTree;
          throw new Error("Could not persist the local upload result");
        }
        await storeTree(dir);
      };
    }, dir);
    release();
    const notice = page.getByRole("alert").filter({
      hasText:
        "Notebook uploaded. Could not finish updating the local notebook.",
    });
    const details = notice.getByRole("button", {
      name: "Details",
      exact: true,
    });
    await details.focus();
    await expect(details).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(notice).toContainText(
      "Could not persist the local upload result",
    );
    await expect
      .poll(() => remoteBytes(request, a, "README.md"))
      .toEqual(bytes("Changed A\n"));
    await expect(
      dialog.getByRole("button", { name: "Upload", exact: true }),
    ).toBeEnabled();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(b.id);
    await expect(bMessage).toHaveValue("Draft upload for B");
  } finally {
    release();
    await page.unroute("**/git-receive-pack");
  }
});
