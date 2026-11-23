import { afterEach, expect, it, vi } from "vitest";
import { NoteDocument } from "./noteDocument";
import { NoteEditor } from "./noteEditor";
import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";

const editors: NoteEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function setup(text = "hello") {
  let resolve!: (links: string[]) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<string[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const upload = vi.fn(() => pending);
  const failed = vi.fn();
  const editor = new NoteEditor({
    parent: document.body,
    document: new NoteDocument(text),
    display: "source",
    testId: "attachment-test",
    attachments: { upload, failed, trackInsertion: vi.fn() },
  });
  editors.push(editor);
  return { editor, resolve, reject, upload, failed };
}
function paste(editor: NoteEditor, files: File[], text = "") {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files,
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
  editor.view.contentDOM.dispatchEvent(event);
  return event;
}
const picture = () => new File(["image"], "a.png", { type: "image/png" });
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it("inserts only after upload completes and maps the position across typing", async () => {
  const { editor, resolve, upload } = setup();
  editor.view.dispatch({ selection: { anchor: 5 } });
  expect(paste(editor, [picture()]).defaultPrevented).toBe(true);
  expect(editor.handle.text()).toBe("hello");
  expect(upload).toHaveBeenCalledOnce();
  editor.view.dispatch({ changes: { from: 0, insert: "Hi " } });
  resolve(["/assets/a.png"]);
  await settle();
  expect(editor.handle.text()).toBe("Hi hello![](/assets/a.png)");
});

it("pastes text instead of uploading a file when the clipboard contains both", () => {
  const { editor, upload } = setup();
  paste(editor, [picture()], "clipboard text");
  expect(editor.handle.text()).toBe("clipboard texthello");
  expect(upload).not.toHaveBeenCalled();
});

it("does not overwrite an edited selection while uploading", async () => {
  const { editor, resolve, failed } = setup();
  editor.view.dispatch({ selection: { anchor: 1, head: 4 } });
  paste(editor, [picture()]);
  editor.view.dispatch({ changes: { from: 2, to: 3, insert: "X" } });
  resolve(["/assets/a.png"]);
  await settle();
  expect(editor.handle.text()).toBe("heXlo");
  expect(failed).toHaveBeenCalledOnce();
});

it("does not insert after destruction", async () => {
  const { editor, resolve } = setup();
  paste(editor, [picture()]);
  editor.destroy();
  editors.splice(editors.indexOf(editor), 1);
  resolve(["/assets/a.png"]);
  await settle();
  expect(editor.document.text()).toBe("hello");
});

it("does not upload in read-only mode and leaves ordinary text paste alone", () => {
  const { editor, upload } = setup();
  paste(editor, [], "text");
  expect(editor.handle.text()).toBe("texthello");
  editor.setReadOnly(true);
  paste(editor, [picture()]);
  expect(upload).not.toHaveBeenCalled();
  expect(editor.handle.text()).toBe("texthello");
});

it("reports upload failure and keeps the text", async () => {
  const { editor, reject, failed } = setup();
  paste(editor, [picture()]);
  reject(new Error("disk failed"));
  await settle();
  expect(failed).toHaveBeenCalledOnce();
  expect(editor.handle.text()).toBe("hello");
});

it("inserts readable text in order when another dropped text file goes missing", async () => {
  const { editor, failed, upload } = setup();
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue(5);
  const failure = new DOMException("File removed", "NotFoundError");
  const read = FileReader.prototype.readAsText;
  const mocked = vi
    .spyOn(FileReader.prototype, "readAsText")
    .mockImplementation(function (this: FileReader, file, encoding) {
      if ((file as File).name !== "missing.txt") {
        read.call(this, file, encoding);
        return;
      }
      Object.defineProperty(this, "error", { value: failure });
      queueMicrotask(() => this.dispatchEvent(new ProgressEvent("error")));
    });
  try {
    const event = new MouseEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: ["first", "missing", "second"].map(
          (text) => new File([text], `${text}.txt`, { type: "text/plain" }),
        ),
      },
    });
    editor.view.contentDOM.dispatchEvent(event);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(failure));
    expect(editor.handle.text()).toBe("hellofirst\nsecond");
    expect(upload).not.toHaveBeenCalled();
  } finally {
    mocked.mockRestore();
  }
});

it("keeps the slash command when the image chooser is cancelled", async () => {
  const { editor, upload } = setup("/image");
  editor.view.dispatch({ selection: { anchor: 6 } });
  startCompletion(editor.view);
  await vi.waitFor(() =>
    expect(completionStatus(editor.view.state)).toBe("active"),
  );
  const index = currentCompletions(editor.view.state).findIndex(
    (option) => option.label === "/image",
  );
  expect(index).toBeGreaterThanOrEqual(0);
  editor.view.dispatch({ effects: setSelectedCompletion(index) });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(acceptCompletion(editor.view)).toBe(true);
  const picker = document.querySelector<HTMLInputElement>(
    'input[type="file"][aria-label="Insert image"]',
  );
  expect(picker).not.toBeNull();
  picker!.dispatchEvent(new Event("cancel"));
  expect(editor.handle.text()).toBe("/image");
  expect(upload).not.toHaveBeenCalled();
  expect(picker!.isConnected).toBe(false);
});
