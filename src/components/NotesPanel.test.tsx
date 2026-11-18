import { act } from "react";
import { expect, it, vi } from "vitest";
import i18next from "../i18n/i18n";
import { Notebook } from "../lib/notebook";
import { getNotificationState, resetNotifications } from "../lib/notifications";
import { mountTestRoot, unmountTestRoot } from "../test/component";
import NotesPanel from "./NotesPanel";

const { createNewNote } = vi.hoisted(() => ({ createNewNote: vi.fn() }));
vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({ initialized: true, createNewNote }),
  },
}));

it("reports a failed note creation in the language active when it finishes", async () => {
  const { container, root } = mountTestRoot();
  const previousLanguage = i18next.language;
  let rejectWrite: (error: Error) => void;
  createNewNote.mockReturnValue(
    new Promise((_, reject) => {
      rejectWrite = reject;
    }),
  );
  resetNotifications();
  try {
    await i18next.changeLanguage("en-US");
    act(() =>
      root.render(<NotesPanel notebook={new Notebook()} tabNode={null} />),
    );
    const create = container.querySelector<HTMLButtonElement>(
      'button[aria-label="New note"]',
    );
    act(() => create.click());
    expect(createNewNote).toHaveBeenCalledOnce();
    await act(() => i18next.changeLanguage("zh-CN").then(() => {}));
    await act(async () => rejectWrite(new Error("disk full")));
    expect(getNotificationState().current?.message).toContain("新建笔记失败");
  } finally {
    unmountTestRoot(container, root);
    await i18next.changeLanguage(previousLanguage);
    resetNotifications();
  }
});
