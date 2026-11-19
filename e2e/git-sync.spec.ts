import type { Page } from "@playwright/test";
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

test("keeps the editor and queued typing with a note moved during Download", async ({
  app,
  page,
  request,
}) => {
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
  // Hold the fetch until the real editor has dispatched input.
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
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  try {
    await fetchStarted;
    await app.visibleEditor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" queued");
  } finally {
    release();
  }
  await expect(app.tab(moved)).toHaveAttribute("aria-selected", "true");
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
  await download(app, remote);
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
  const messages = await app.recordMessages();
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
    release();
    await expect
      .poll(() => remoteBytes(request, a, "README.md"))
      .toEqual(bytes("Changed A\n"));
    await expect.poll(messages).toContain("Notebook uploaded");
    await expect(
      dialog.getByRole("button", { name: "Upload", exact: true }),
    ).toBeEnabled();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(b.id);
  } finally {
    release();
    await page.unroute("**/git-receive-pack");
  }
});
