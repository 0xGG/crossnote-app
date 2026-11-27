import type { APIRequestContext, Page } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  expectReadOnlyNoteOpen,
  expectNoCheckoutWrites,
  indexEntries,
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

async function conflictDuringDownload(
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
  const messages = await whileDownloading(app, remote.id, action);
  await expect
    .poll(messages)
    .toContainEqual(expect.stringContaining("Sync conflicts: Story.md"));
  return { dir, remote };
}

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

test("keeps typing queued during a conflicting download in the open note", async ({
  app,
  page,
  request,
}) => {
  const { dir, remote } = await conflictDuringDownload(
    app,
    request,
    async () => {
      await app.visibleEditor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type(" queued");
    },
  );
  await expect
    .poll(() => app.storedText(`${dir}/Story.md`))
    .toContain("Local story queued");
  expect(await app.editorText(app.visibleEditor)).toBe("Local story queued");
  expect(await remoteBytes(request, remote, "Story.md/chapter.md")).toEqual(
    bytes("Remote chapter"),
  );
  await page.reload();
  await app.waitUntilReady();
  await expect(app.tab("Story")).toHaveAttribute("aria-selected", "true");
  await expect(app.preview).toContainText("Local story queued");
});

for (const [action, startSync] of [
  [
    "Download",
    (app: CrossnoteApp, id: string) =>
      app
        .notebook(id)
        .getByRole("treeitem", { name: /Download/ })
        .click(),
  ],
  ["Upload", startUpload],
] as const) {
  test(`keeps the existing recovery folder and its open draft when ${action} conflicts`, async ({
    app,
    page,
    request,
  }) => {
    const folder = ".crossnote-recovered";
    const story = `${folder}/Story.md`;
    const rules = `${folder}/.gitignore`;
    const marker = bytes("# Crossnote recovered files\n*\n");
    const remote = await createRemote(request, {
      "Guide.md": bytes(`See [[${folder}/Story]]`),
    });
    await app.open();
    const dir = await cloneRemote(app, remote);
    await localBytes(page, `${dir}/${rules}`, marker);
    await localBytes(page, `${dir}/${story}`, bytes("My draft"));
    await app.noteCards.getByText("Guide", { exact: true }).click();
    await app.preview.getByRole("link", { name: `${folder}/Story` }).click();
    await expect(app.preview.filter({ visible: true })).toContainText(
      "My draft",
    );
    const head = await localBytes(page, `${dir}/.git/refs/heads/master`);
    const index = await localBytes(page, `${dir}/.git/index`);
    const published = bytes("Published story");
    await changeRemote(request, remote, { [story]: published });
    const messages = await app.recordMessages();
    await startSync(app, remote.id);
    await expect
      .poll(messages)
      .toContainEqual(expect.stringContaining(`Sync conflicts: ${story}`));
    expect(await localBytes(page, `${dir}/${story}`)).toEqual(
      bytes("My draft"),
    );
    expect(await localBytes(page, `${dir}/${rules}`)).toEqual(marker);
    expect(await localBytes(page, `${dir}/.git/refs/heads/master`)).toEqual(
      head,
    );
    expect(await localBytes(page, `${dir}/.git/index`)).toEqual(index);
    await expect(app.tab("Story")).toHaveAttribute("aria-selected", "true");
    await expect(app.preview.filter({ visible: true })).toContainText(
      "My draft",
    );
    expect(await remoteBytes(request, remote, story)).toEqual(published);
  });
}

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
  test(`applies a rename from the ${name} after Download pauses`, async ({
    app,
    request,
  }) => {
    const { dir } = await conflictDuringDownload(app, request, () =>
      rename(app),
    );
    await expect(app.tab("Renamed")).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(() => app.storedText(`${dir}/Renamed.md`))
      .toContain("Local story");
    expect(await app.storedText(`${dir}/Story.md`)).toBeUndefined();
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
    `Sync conflicts: ${file}. Resolve the conflicts and retry.`,
  );
  expect(await localBytes(page, `${dir}/assets/tracked.md`)).toEqual(
    bytes("Base"),
  );
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(bytes("fixture"));
});

test("protects a draft across changes to a linked ignore file and its rules", async ({
  app,
  page,
  request,
}) => {
  test.slow();
  const draft = bytes("# Meeting draft\n");
  const remote = await createRemote(request, {
    "README.md": bytes("# Notes\n"),
    ".gitignore": bytes("draft.md\n"),
    "rules.txt": bytes("draft.md\n"),
  });
  const remoteState = async () => {
    const response = await request.get(`${fixtureURL}/repos/${remote.id}`);
    expect(response.ok()).toBe(true);
    return (await response.json()) as { sha: string; files: string[] };
  };
  await app.open();
  const dir = await cloneRemote(app, remote);
  await expectReadOnlyNoteOpen(page, async () => {
    await app.noteCards.getByText("README", { exact: true }).click();
    await expect(app.noteTitle).toHaveValue("README");
  });
  await localBytes(page, `${dir}/draft.md`, draft);
  await changeRemote(request, remote, {
    ".gitignore": { symlink: "rules.txt" },
  });
  const linked = await remoteState();
  await download(app, remote);
  const head = () => app.storedText(`${dir}/.git/refs/heads/master`);
  const index = () => indexEntries(page, `${dir}/.git/index`);
  expect((await head())?.trim()).toBe(linked.sha);
  expect((await index()).find(({ name }) => name === ".gitignore")?.mode).toBe(
    "120000",
  );
  const edit = bytes("# Shared notes\n");
  await localBytes(page, `${dir}/README.md`, edit);
  await upload(app, remote);
  const shared = await remoteState();
  expect(shared.sha).not.toBe(linked.sha);
  expect(await remoteBytes(request, remote, "README.md")).toEqual(edit);
  expect(shared.files).not.toContain("draft.md");
  const installed = await index();
  expect(installed.map(({ name }) => name)).not.toContain("draft.md");
  expect(await localBytes(page, `${dir}/draft.md`)).toEqual(draft);

  await changeRemote(request, remote, {
    "rules.txt": bytes("# Publish notes\n"),
  });
  await download(
    app,
    remote,
    "Sync conflicts: draft.md. Resolve the conflicts and retry.",
  );
  expect((await head())?.trim()).toBe(shared.sha);
  expect(await index()).toEqual(installed);
  expect(await localBytes(page, `${dir}/rules.txt`)).toEqual(
    bytes("draft.md\n"),
  );
  expect(await localBytes(page, `${dir}/draft.md`)).toEqual(draft);

  await page.evaluate(async (dir) => {
    const { pfs } = window as unknown as FileHost & {
      pfs: { rename(source: string, target: string): Promise<void> };
    };
    await pfs.rename(`${dir}/draft.md`, `${dir}/meeting.md`);
    await pfs.storeTree(dir);
  }, dir);
  await upload(app, remote);
  expect(await remoteBytes(request, remote, "meeting.md")).toEqual(draft);
  const published = await remoteState();
  expect(published.files).not.toContain("draft.md");
  expect((await head())?.trim()).toBe(published.sha);
});

test("pauses upload before changing a conflicting attachment or another note", async ({
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
  const index = await localBytes(page, `${dir}/.git/index`);
  const head = await localBytes(page, `${dir}/.git/refs/heads/master`);
  await changeRemote(request, remote, {
    "README.md": bytes("Remote update"),
    "assets/a.bin": theirs,
  });
  const before = await (
    await request.get(`${fixtureURL}/repos/${remote.id}`)
  ).json();
  const messages = await app.recordMessages();
  await expectNoCheckoutWrites(page, dir, async () => {
    await startUpload(app, remote.id);
    await expect
      .poll(messages)
      .toContainEqual(expect.stringContaining("Sync conflicts: assets/a.bin"));
  });
  expect(await localBytes(page, `${dir}/.git/index`)).toEqual(index);
  expect(await localBytes(page, `${dir}/.git/refs/heads/master`)).toEqual(head);
  expect(await localBytes(page, `${dir}/README.md`)).toEqual(
    bytes("# Conflict\n"),
  );
  expect(await localBytes(page, `${dir}/assets/a.bin`)).toEqual(ours);
  expect(
    await page.evaluate(
      (dir) => (window as unknown as FileHost).pfs.readdir(`${dir}/assets`),
      dir,
    ),
  ).toEqual(["a.bin"]);
  expect(
    (await (await request.get(`${fixtureURL}/repos/${remote.id}`)).json()).sha,
  ).toBe(before.sha);

  await localBytes(page, `${dir}/assets/mine.bin`, ours);
  await localBytes(page, `${dir}/assets/a.bin`, original);
  await upload(app, remote);
  expect(await remoteBytes(request, remote, "assets/mine.bin")).toEqual(ours);
  expect(await remoteBytes(request, remote, "assets/a.bin")).toEqual(theirs);
});

test("pauses a directory replacement for an ignored edit and draft until manual retry", async ({
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
    ".gitignore": bytes("assets/a.bin\nassets/private.bin\n.private/\n"),
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
  const index = await localBytes(page, `${dir}/.git/index`);
  const fetch = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${remote.proxy}/`) &&
      response.url().endsWith(`/git/${remote.id}.git/git-upload-pack`) &&
      response.request().method() === "POST",
  );
  const downloadMessages = await app.recordMessages();
  await expectNoCheckoutWrites(page, dir, async () => {
    await app
      .notebook(remote.id)
      .getByRole("treeitem", { name: /Download/ })
      .click();
    expect((await fetch).ok()).toBe(true);
    await expect
      .poll(downloadMessages, { timeout: 20000 })
      .toContainEqual(expect.stringContaining("assets/a.bin"));
  });
  const expectPreserved = async () => {
    expect((await app.storedText(branch))?.trim()).toBe(ignored.sha);
    expect(await localBytes(page, `${dir}/.git/index`)).toEqual(index);
    expect(await localBytes(page, `${dir}/assets/a.bin`)).toEqual(edit);
    expect(await localBytes(page, `${dir}/assets/private.bin`)).toEqual(draft);
    expect(
      await page.evaluate(
        (dir) => (window as unknown as FileHost).pfs.readdir(dir),
        dir,
      ),
    ).not.toContain(".crossnote-recovered");
  };
  await expectPreserved();
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await expectPreserved();

  await localBytes(page, `${dir}/saved.bin`, edit);
  await localBytes(page, `${dir}/.private/private.bin`, draft);
  await localBytes(page, `${dir}/assets/a.bin`, original);
  await page.evaluate(async (dir) => {
    const { pfs } = window as unknown as FileHost;
    await pfs.unlink(`${dir}/assets/private.bin`);
    await pfs.storeTree(dir);
  }, dir);
  await upload(app, remote);
  const published = await remoteState();
  expect(published.sha).not.toBe(incoming.sha);
  expect((await app.storedText(branch))?.trim()).toBe(published.sha);
  expect(published.files).toEqual([
    ".gitignore",
    "README.md",
    "assets",
    "saved.bin",
  ]);
  expect(await remoteBytes(request, remote, "saved.bin")).toEqual(edit);
  expect(await localBytes(page, `${dir}/assets`)).toEqual(replacement);
  expect(await localBytes(page, `${dir}/.private/private.bin`)).toEqual(draft);
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
    .toContainEqual(expect.stringContaining("local.bin (deleted locally)"));
  await expect
    .poll(messages)
    .toContainEqual(expect.stringContaining("remote.bin (deleted remotely)"));
  expect(await app.storedText(`${dir}/local.bin`)).toBeUndefined();
  expect(await remoteBytes(request, remote, "local.bin")).toEqual([0, 3]);
  expect(await localBytes(page, `${dir}/remote.bin`)).toEqual([0, 2]);
});

test("keeps an overlapping Markdown edit and stops before installing other remote changes", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "A.md": bytes("One\n"),
    "B.md": bytes("Two\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const ours = bytes("My version\r\n");
  await localBytes(page, `${dir}/B.md`, ours);
  await page.evaluate(async (dir) => {
    const { pfs } = window as unknown as FileHost;
    await pfs.unlink(`${dir}/.git/index`);
    await pfs.storeTree(dir);
  }, dir);
  await changeRemote(request, remote, {
    "A.md": bytes("New first note\n"),
    "B.md": bytes("Remote version\n"),
  });
  const messages = await app.recordMessages();
  await expectNoCheckoutWrites(page, dir, async () => {
    await app
      .notebook(remote.id)
      .getByRole("treeitem", { name: /Download/ })
      .click();
    await expect
      .poll(messages)
      .toContainEqual(expect.stringContaining("Sync conflicts: B.md"));
  });
  expect(await localBytes(page, `${dir}/B.md`)).toEqual(ours);
  expect(await localBytes(page, `${dir}/A.md`)).toEqual(bytes("One\n"));
  expect(await app.storedText(`${dir}/.git/index`)).toBeUndefined();
});

test("opens and uploads a notebook with untouched legacy pull records", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("Initial note"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const id = dir.slice("/notebooks/".length);
  const oldKey = `pending/pull/${id}`;
  const sha = (await app.storedText(`${dir}/.git/refs/heads/master`))?.trim();
  expect(sha).toMatch(/^[0-9a-f]{40}$/);
  // Both records live in this test's isolated Playwright context.
  await page.evaluate(
    async ({ id, sha, oldKey }) => {
      localStorage.setItem(
        oldKey,
        JSON.stringify({
          localSha: sha,
          cache: {
            "old-local.md": { status: "added", markdown: "Old local record" },
          },
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("crossnote-pull-recovery", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("pulls");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("pulls", "readwrite");
          tx.objectStore("pulls").put(
            {
              version: 1,
              localSha: sha,
              remoteSha: sha,
              files: {
                "old-db.md": new TextEncoder().encode("Old database record"),
              },
              conflicts: [],
            },
            id,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
    },
    { id, sha, oldKey },
  );
  const hits: string[] = [];
  await page.exposeFunction("observedLegacyPullAccess", (operation: string) =>
    hits.push(operation),
  );
  await page.addInitScript(
    ({ oldKey }) => {
      const report = (
        window as unknown as {
          observedLegacyPullAccess: (op: string) => Promise<void>;
        }
      ).observedLegacyPullAccess;
      const db = IDBFactory.prototype;
      for (const name of ["open", "deleteDatabase"] as const) {
        const original = db[name];
        db[name] = function (...args: [string, number?]) {
          if (args[0] === "crossnote-pull-recovery") void report(name);
          return Reflect.apply(original, this, args);
        };
      }
      const storage = Storage.prototype;
      for (const name of ["getItem", "setItem", "removeItem"] as const) {
        const original = storage[name];
        storage[name] = function (...args: [string, string?]) {
          if (this === localStorage && args[0] === oldKey) void report(name);
          return Reflect.apply(original, this, args);
        };
      }
    },
    { oldKey },
  );
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  await app.setEditorText(
    "Saved with legacy records present",
    app.visibleEditor,
  );
  await expect
    .poll(() => app.storedText(`${dir}/README.md`))
    .toContain("Saved with legacy records present");
  await upload(app, remote);
  expect(
    new TextDecoder().decode(
      Uint8Array.from(await remoteBytes(request, remote, "README.md")),
    ),
  ).toContain("Saved with legacy records present");
  expect(await app.storedText(`${dir}/old-local.md`)).toBeUndefined();
  expect(await app.storedText(`${dir}/old-db.md`)).toBeUndefined();
  expect(hits).toEqual([]);
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
