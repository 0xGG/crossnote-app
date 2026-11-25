import type { APIRequestContext, Locator, Page } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  fixtureURL,
  localBytes,
  remoteBytes,
  type Remote,
} from "./git";

type Credentials = { username: string; password: string };
type PrivateRemote = Remote & { credentials: Credentials };
type GitRequest = {
  method: "GET" | "POST";
  service: "git-upload-pack" | "git-receive-pack";
  status: number;
  auth: "missing" | "accepted" | "rejected";
};

const downloaded = [
  { method: "GET", service: "git-upload-pack", status: 401, auth: "missing" },
  { method: "GET", service: "git-upload-pack", status: 200, auth: "accepted" },
  { method: "POST", service: "git-upload-pack", status: 200, auth: "accepted" },
] satisfies GitRequest[];
const receive = [
  { method: "GET", service: "git-receive-pack", status: 401, auth: "missing" },
  { method: "GET", service: "git-receive-pack", status: 200, auth: "accepted" },
] satisfies GitRequest[];
const story = "# Story\n\nOriginal remote story.\n";
const saved = /Git credentials saved/i;
const cleared = /Git credentials cleared/i;

function expectFailedPull(traffic: GitRequest[]) {
  expect(traffic.length).toBeGreaterThan(0);
  for (const request of traffic) expect(request).toEqual(downloaded[0]);
}

test.describe.configure({ timeout: 90_000 });
// Keep captured evidence limited to classified requests and the assertions.
test.use({ trace: "off", screenshot: "off" });

async function createPrivateRemote(request: APIRequestContext) {
  const response = await request.post(`${fixtureURL}/repos`, {
    data: { private: true, files: { "Story.md": bytes(story) } },
  });
  expect(response.ok()).toBe(true);
  const remote: PrivateRemote = await response.json();
  expect(new URL(remote.url).origin).toBe(fixtureURL);
  expect(new URL(remote.proxy).origin).toBe(fixtureURL);
  return remote;
}

async function remoteHead(request: APIRequestContext, remote: Remote) {
  const response = await request.get(`${fixtureURL}/repos/${remote.id}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { sha: string }).sha;
}

async function remoteRequests(request: APIRequestContext, remote: Remote) {
  const response = await request.get(
    `${fixtureURL}/repos/${remote.id}/requests`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as GitRequest[];
}

async function setPermissions(
  request: APIRequestContext,
  remote: Remote,
  data: { denyReceive?: boolean; receiveOnly?: boolean },
) {
  const response = await request.put(
    `${fixtureURL}/repos/${remote.id}/permissions`,
    { data },
  );
  expect(response.ok()).toBe(true);
}

function userField(dialog: Locator) {
  return dialog.getByLabel(/username(?: \(optional\))?$/i);
}

function passwordField(dialog: Locator) {
  return dialog.getByLabel(/password(?: \(optional\))?$/i);
}

async function fillCredentials(
  dialog: Locator,
  credentials: Credentials | null,
) {
  await expect(userField(dialog)).toBeVisible();
  await expect(passwordField(dialog)).toBeVisible();
  try {
    await userField(dialog).fill(credentials?.username ?? "");
    await passwordField(dialog).fill(credentials?.password ?? "");
  } catch {
    // Playwright's fill error includes the value in its call log.
    throw new Error("Could not enter fixture credentials in the dialog");
  }
}

async function dismissAlert(app: CrossnoteApp, message: RegExp) {
  const alert = app.page.getByRole("alert").filter({ hasText: message });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Close", exact: true }).click();
  await expect(alert).toBeHidden();
}

async function clonePrivate(app: CrossnoteApp, remote: PrivateRemote) {
  await app.open();
  const dir = await cloneRemote(app, remote, async (dialog) => {
    if ((await userField(dialog).getAttribute("type")) === "text")
      await dialog
        .getByRole("button", { name: "toggle username visibility" })
        .click();
    await fillCredentials(dialog, remote.credentials);
  });
  // The authenticated clone must be registered before claiming persistence.
  await dismissAlert(app, saved);
  return dir;
}

async function revealGitSettings(dialog: Locator) {
  const accordion = dialog.getByRole("button", { name: /Git repository/ });
  if ((await accordion.getAttribute("aria-expanded")) !== "true")
    await accordion.click();
}

async function saveCredentials(
  dialog: Locator,
  credentials: Credentials | null,
) {
  await revealGitSettings(dialog);
  await fillCredentials(dialog, credentials);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function startUpload(app: CrossnoteApp, remote: Remote, scope?: Locator) {
  await app
    .notebook(remote.id, scope)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  const dialog = app.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function holdNextGitRead(page: Page) {
  let release!: () => void;
  let requested!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (requested = resolve));
  await page.route(
    "**/info/refs?service=git-upload-pack",
    async (route) => {
      requested();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  return { started, release };
}

test("uses saved clone credentials for both upload stages and retries the original pending commit", async ({
  app,
  request,
  page,
}) => {
  const remote = await createPrivateRemote(request);
  const dir = await clonePrivate(app, remote);
  const readHead = async () =>
    (await app.storedText(`${dir}/.git/refs/heads/master`))?.trim();
  const file = `${dir}/Story.md`;
  expect(await remoteRequests(request, remote)).toEqual(downloaded);

  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await app.refuseWrites();
  const before = await app.storedText(file);
  await app.noteCards.getByText("Story", { exact: true }).click();
  await expect(app.preview).toContainText("Original remote story.");
  expect(await app.refusedWrites()).toEqual([]);
  expect(await app.storedText(file)).toBe(before);
  await app.refuseWrites(false);

  await app.modeButton("Edit").click();
  await app.setEditorText(
    "# Story\n\nA local edit that must reach the remote.\n",
    app.visibleEditor,
  );
  await expect
    .poll(() => app.storedText(file))
    .toContain("A local edit that must reach the remote.");
  const edited = (await app.storedText(file))!;
  await changeRemote(request, remote, {
    "Incoming.md": bytes("# New remote note\n"),
  });
  const incoming = await remoteHead(request, remote);
  await setPermissions(request, remote, { denyReceive: true });
  await app.openNotes(remote.id);
  await startUpload(app, remote);
  await dismissAlert(app, /Download completed\. Push failed\./);
  let traffic = await remoteRequests(request, remote);
  expect(traffic.slice(downloaded.length)).toEqual([
    ...downloaded,
    ...receive,
    {
      method: "POST",
      service: "git-receive-pack",
      status: 403,
      auth: "accepted",
    },
  ]);
  expect(await remoteHead(request, remote)).toBe(incoming);
  expect(await remoteBytes(request, remote, "Story.md")).toEqual(bytes(story));
  expect(await app.storedText(`${dir}/Incoming.md`)).toContain(
    "New remote note",
  );
  await expect(
    app.noteCards.getByText("Incoming", { exact: true }),
  ).toBeVisible();
  const pending = await readHead();
  expect(pending).toMatch(/^[0-9a-f]{40}$/);
  expect(pending).not.toBe(incoming);

  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  expect(await readHead()).toBe(pending);
  expect(await app.storedText(file)).toBe(edited);
  await setPermissions(request, remote, { denyReceive: false });
  await startUpload(app, remote);
  await dismissAlert(app, /Notebook uploaded/i);
  expect((await remoteRequests(request, remote)).slice(traffic.length)).toEqual(
    [
      ...downloaded,
      ...receive,
      {
        method: "POST",
        service: "git-receive-pack",
        status: 200,
        auth: "accepted",
      },
    ],
  );
  expect(await remoteHead(request, remote)).toBe(pending);
  expect(await readHead()).toBe(pending);
  expect(await remoteBytes(request, remote, "Story.md")).toEqual(bytes(edited));

  traffic = await remoteRequests(request, remote);
  await startUpload(app, remote);
  await dismissAlert(app, /No changes to upload/i);
  expect((await remoteRequests(request, remote)).slice(traffic.length)).toEqual(
    downloaded,
  );
  expect(await remoteHead(request, remote)).toBe(pending);

  await changeRemote(request, remote, {
    "Remote.md": bytes("# Only downloaded\n"),
  });
  const downloadOnly = await remoteHead(request, remote);
  traffic = await remoteRequests(request, remote);
  await startUpload(app, remote);
  await dismissAlert(app, /Downloaded remote changes\. No changes to upload/i);
  expect((await remoteRequests(request, remote)).slice(traffic.length)).toEqual(
    downloaded,
  );
  expect(await readHead()).toBe(downloadOnly);
  expect(await app.storedText(`${dir}/Remote.md`)).toContain("Only downloaded");

  const afterReplyLoss = "Saved before the server reply was lost\n";
  await localBytes(page, file, bytes(afterReplyLoss));
  await page.route(
    "**/git-receive-pack",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await startUpload(app, remote);
  await dismissAlert(app, /Failed to upload notebook/i);
  const sent = await remoteHead(request, remote);
  expect(sent).not.toBe(downloadOnly);
  expect(await readHead()).toBe(sent);
  expect(await remoteBytes(request, remote, "Story.md")).toEqual(
    bytes(afterReplyLoss),
  );
  await changeRemote(request, remote, {
    "After.md": bytes("# Newer remote change\n"),
  });
  const newer = await remoteHead(request, remote);
  expect(newer).not.toBe(sent);
  traffic = await remoteRequests(request, remote);
  await startUpload(app, remote);
  await dismissAlert(
    app,
    /The remote already has your local commit\. Downloaded newer changes\./,
  );
  expect((await remoteRequests(request, remote)).slice(traffic.length)).toEqual(
    downloaded,
  );
  expect(await remoteHead(request, remote)).toBe(newer);
  expect(await readHead()).toBe(newer);
  expect(await app.storedText(`${dir}/After.md`)).toContain(
    "Newer remote change",
  );
  expect(await remoteBytes(request, remote, "Story.md")).toEqual(
    bytes(afterReplyLoss),
  );
});

test("confirms an authenticated POST even when the local tracking ref cannot be written", async ({
  app,
  page,
  request,
}) => {
  const remote = await createPrivateRemote(request);
  const dir = await clonePrivate(app, remote);
  const file = bytes("# Received after anonymous discovery\n");
  await localBytes(page, `${dir}/Story.md`, file);
  await setPermissions(request, remote, { receiveOnly: true });
  await page.route("**/git-receive-pack", async (route) => {
    const response = await route.fetch();
    if (response.ok()) await app.refuseWrites();
    await route.fulfill({ response });
  });
  await startUpload(app, remote);
  await dismissAlert(
    app,
    /Notebook uploaded\. Could not finish updating the local notebook/,
  );
  expect(await app.refusedWrites()).toContain("file");
  await app.refuseWrites(false);
  const ref = `${dir}/.git/refs/heads/master`;
  expect(await remoteHead(request, remote)).toBe(
    (await app.storedText(ref))?.trim(),
  );
  expect(await remoteBytes(request, remote, "Story.md")).toEqual(file);
  expect(
    (await remoteRequests(request, remote))
      .slice(downloaded.length)
      .filter((entry) => entry.service === "git-receive-pack"),
  ).toEqual([
    {
      method: "GET",
      service: "git-receive-pack",
      status: 200,
      auth: "missing",
    },
    {
      method: "POST",
      service: "git-receive-pack",
      status: 401,
      auth: "missing",
    },
    {
      method: "POST",
      service: "git-receive-pack",
      status: 200,
      auth: "accepted",
    },
    {
      method: "GET",
      service: "git-receive-pack",
      status: 200,
      auth: "missing",
    },
  ]);
});

test("shows one download authentication failure and retries after changing saved credentials", async ({
  app,
  request,
  page,
}) => {
  const remote = await createPrivateRemote(request);
  const dir = await clonePrivate(app, remote);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  await saveCredentials(page.getByRole("dialog"), null);
  await dismissAlert(app, cleared);
  await changeRemote(request, remote, {
    "Incoming.md": bytes("# Retry result\n"),
  });
  const incoming = await remoteHead(request, remote);

  await page.clock.install();
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  const beforeCheck = (await remoteRequests(request, remote)).length;
  const backgroundMessages = await app.recordMessages();
  await page.clock.fastForward(61 * 60_000);
  const signIn = app
    .notebook(remote.id)
    .getByText("Git sign-in required", { exact: true });
  await expect(signIn).toBeVisible();
  expectFailedPull((await remoteRequests(request, remote)).slice(beforeCheck));
  expect(await backgroundMessages()).toEqual([]);
  const readHead = async () =>
    (await app.storedText(`${dir}/.git/refs/heads/master`))?.trim();
  const local = await readHead();
  expect(local).not.toBe(incoming);
  const beforeUpload = (await remoteRequests(request, remote)).length;
  await startUpload(app, remote);
  await dismissAlert(
    app,
    /Upload stopped during download\. Nothing was pushed\./,
  );
  const afterUpload = await remoteRequests(request, remote);
  expectFailedPull(afterUpload.slice(beforeUpload));
  expect(await readHead()).toBe(local);

  const before = afterUpload.length;
  const messages = await app.recordMessages();
  const download = app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ });
  await download.click();
  const change = page
    .getByRole("alert")
    .getByRole("button", { name: "Change Git credentials" });
  await expect(change).toBeVisible();
  const denied = (await remoteRequests(request, remote)).slice(before);
  expectFailedPull(denied);
  expect(await readHead()).toBe(local);
  expect(await app.storedText(`${dir}/Incoming.md`)).toBeUndefined();

  await change.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await revealGitSettings(dialog);
  const values = await Promise.all([
    userField(dialog).inputValue(),
    passwordField(dialog).inputValue(),
  ]);
  expect(values.every((value) => value === "")).toBe(true);
  await saveCredentials(dialog, remote.credentials);
  await dismissAlert(app, saved);
  // Anything queued by the failed attempt must arrive before this save notice.
  const alerts = await messages();
  expect(alerts).toHaveLength(2);
  expect(alerts[1]).toMatch(saved);
  expect((await remoteRequests(request, remote)).slice(before)).toEqual(denied);
  expect(await readHead()).toBe(local);

  await download.click();
  await dismissAlert(app, /Notebook downloaded/i);
  await expect(signIn).toBeHidden();
  expect(
    (await remoteRequests(request, remote)).slice(before + denied.length),
  ).toEqual(downloaded);
  expect(await readHead()).toBe(incoming);
  expect(await app.storedText(`${dir}/Incoming.md`)).toContain("Retry result");
});

test("keeps another notebook's settings draft until its editor closes", async ({
  app,
  page,
  request,
}) => {
  const a = await createPrivateRemote(request);
  const b = await createRemote(request, { "README.md": bytes("# Notes\n") });
  await clonePrivate(app, a);
  await cloneRemote(app, b);
  await dismissAlert(app, /Notebook cloned/i);
  const dialog = page.getByRole("dialog");
  await app
    .notebook(a.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  await saveCredentials(dialog, null);
  await dismissAlert(app, cleared);
  await page.clock.install();

  const { started, release } = await holdNextGitRead(page);
  const bName = "Saved settings for B";
  try {
    await app
      .notebook(a.id)
      .getByRole("treeitem", { name: /Upload/ })
      .click();
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await started;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await app
      .notebook(b.id)
      .getByRole("treeitem", { name: /Settings/ })
      .click();
    await dialog.getByRole("textbox", { name: "Notebook name" }).fill(bName);
  } finally {
    release();
  }

  const result = page.getByRole("alert").filter({
    hasText: "Upload stopped during download. Nothing was pushed.",
  });
  const change = result.getByRole("button", { name: "Change Git credentials" });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(change).toHaveCount(0);
  await page.clock.fastForward(8500);
  await expect(result).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(app.notebook(bName)).toBeVisible();
  await change.focus();
  await expect(change).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("textbox", { name: "Notebook name" }),
  ).toHaveValue(a.id);
});

test("allows keyboard access to Git results from the narrow drawer", async ({
  app,
  page,
  request,
}) => {
  const remote = await createPrivateRemote(request);
  await clonePrivate(app, remote);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const dialog = page.getByRole("dialog");
  await saveCredentials(dialog, null);
  await dismissAlert(app, cleared);
  await page.setViewportSize({ width: 375, height: 700 });

  for (const run of [
    async (drawer: Locator) => {
      const { started, release } = await holdNextGitRead(page);
      try {
        await app
          .notebook(remote.id, drawer)
          .getByRole("treeitem", { name: /Download/ })
          .click();
        await started;
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(drawer).toBeVisible();
      } finally {
        release();
      }
      const details = drawer.getByRole("button", {
        name: "Details",
        exact: true,
      });
      await details.focus({ timeout: 5000 });
      await expect(details).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
    },
    (drawer: Locator) => startUpload(app, remote, drawer),
  ]) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await app.expandNotebook(remote.id, dialog);
    await run(dialog);
    const alert = page.getByRole("alert");
    const change = alert.getByRole("button", {
      name: "Change Git credentials",
    });
    await change.focus({ timeout: 5000 });
    await expect(change).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      alert.getByRole("button", { name: "Details", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(alert.locator("pre")).toContainText("HTTP 401");
    await page.keyboard.press("Shift+Tab");
    await expect(change).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("textbox", { name: "Notebook name" }),
    ).toHaveValue(remote.id);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(alert).toBeHidden();
  }
});

test("stops authenticated Git redirects to another repository on either origin", async ({
  app,
  request,
}) => {
  const source = { ...(await createPrivateRemote(request)), proxy: "" };
  const target = await createPrivateRemote(request);
  const dir = await clonePrivate(app, source);
  const readHead = async () =>
    (await app.storedText(`${dir}/.git/refs/heads/master`))?.trim();
  const initial = await readHead();
  const endpoint = `${fixtureURL}/repos/${source.id}/redirect`;
  const download = app
    .notebook(source.id)
    .getByRole("treeitem", { name: /Download/ });

  for (const crossOrigin of [false, true]) {
    const response = await request.put(endpoint, {
      data: { destination: target.id, crossOrigin },
    });
    expect(response.ok()).toBe(true);
    const { redirectOrigin } = await response.json();
    expect(new URL(redirectOrigin).hostname).toBe("127.0.0.1");
    expect(redirectOrigin !== fixtureURL).toBe(crossOrigin);

    const before = (await remoteRequests(request, source)).length;
    await download.click();
    await dismissAlert(app, /failed to download|download.*failed/i);
    expect((await remoteRequests(request, source)).slice(before)).toEqual([
      downloaded[0],
      {
        method: "GET",
        service: "git-upload-pack",
        status: 307,
        auth: "accepted",
      },
    ]);
    expect(await remoteRequests(request, target)).toEqual([]);
    expect(await readHead()).toBe(initial);
  }
});
