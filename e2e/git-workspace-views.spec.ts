import type { Emitter, EventType } from "../src/lib/event";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  localBytes,
} from "./git";

test("keeps the filtered list and open note current after download succeeds and push fails", async ({
  app,
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 540 });
  const files = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `Topic-${String(index).padStart(2, "0")}.md`,
      bytes(`Original summary ${index}\n`),
    ]),
  );
  const remote = await createRemote(request, {
    ...files,
    "Topic-05.md": bytes(
      "Original summary 5\n\nShared paragraph\n\nOld ending\n",
    ),
    "Private.md": bytes("Previous local note\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.searchBox.fill("Topic");
  await expect(app.noteCards).toHaveCount(12);
  await app.notesPanel.getByRole("button", { name: "Sort notes" }).click();
  await page.getByRole("button", { name: "Title", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(app.noteCards.first()).toContainText("Topic-11");
  const card = app.noteCards.nth(6);
  await card.scrollIntoViewIfNeeded();
  await card.getByText("Topic-05", { exact: true }).click();
  await app.modeButton("Source code").click();
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toContain("Original summary 5");
  await app.selectTab(remote.id);
  const scrollTop = () =>
    app.notesPanel.evaluate((panel) => panel.parentElement!.scrollTop);
  const position = await scrollTop();
  expect(position).toBeGreaterThan(0);
  await app.selectTab("Topic-05");

  await localBytes(
    page,
    `${dir}/Private.md`,
    bytes("Local change to upload\n"),
  );
  const downloaded = "Downloaded summary\n\nShared paragraph\n\nOld ending\n";
  const draft = "Original summary 5\n\nShared paragraph\n\nTyped during push\n";
  await changeRemote(request, remote, { "Topic-05.md": bytes(downloaded) });
  const pushing = page.waitForRequest("**/git-receive-pack");
  let rejectPush!: () => void;
  const holdPush = new Promise<void>((resolve) => {
    rejectPush = resolve;
  });
  await page.route(
    "**/git-receive-pack",
    async (route) => {
      await holdPush;
      await route.abort("failed");
    },
    { times: 1 },
  );
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  const dialog = page.getByRole("dialog");
  try {
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await pushing;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await app.setEditorText(draft, app.visibleEditor);
    expect(await app.editorText(app.visibleEditor)).toBe(draft);
    expect(await app.storedText(`${dir}/Topic-05.md`)).toBe(downloaded);
  } finally {
    rejectPush();
  }
  await expect.poll(messages).toContain("Download completed. Push failed.");
  const merged = downloaded.replace("Old ending", "Typed during push");
  expect(await app.storedText(`${dir}/Topic-05.md`)).toContain(merged);
  await expect(app.tab("Topic-05")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => app.editorText(app.visibleEditor)).toBe(merged);
  await app.selectTab(remote.id);
  await expect(app.searchBox).toHaveValue("Topic");
  await expect(app.noteCards).toHaveCount(12);
  await expect(card).toContainText("Topic-05");
  await expect(card).toContainText("Downloaded summary");
  await expect.poll(scrollTop).toBe(position);
});

test("checking for remote changes updates the sidebar without refreshing the workspace", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "Note.md": bytes("Local contents\n"),
  });
  await page.clock.install();
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("Note", { exact: true }).click();
  await app.modeButton("Source code").click();
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toContain("Local contents");
  const refreshes = await page.evaluateHandle((dir) => {
    const { globalEmitter } = window as unknown as { globalEmitter: Emitter };
    const events: string[] = [];
    globalEmitter.on(
      "PerformedGitOperation" as EventType,
      ({ notebookPath }) => {
        if (notebookPath === dir) events.push(notebookPath);
      },
    );
    return events;
  }, dir);
  await changeRemote(request, remote, {
    "Note.md": bytes("Remote contents\n"),
  });
  await page.clock.fastForward(61 * 60_000);
  await expect(app.notebook(remote.id).locator('img[alt="🔔"]')).toBeVisible();
  expect(await refreshes.jsonValue()).toEqual([]);
  expect(await app.editorText(app.visibleEditor)).toContain("Local contents");
  expect(await app.storedText(`${dir}/Note.md`)).toBe("Local contents\n");
});
