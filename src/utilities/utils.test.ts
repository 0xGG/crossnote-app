import { describe, expect, it, vi } from "vitest";
import { debounce, notebookNameFromGitURL, randomID } from "./utils";

describe("debounce", () => {
  it("calls once the calls have stopped for the delay", () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);
      debounced();
      vi.advanceTimersByTime(200);
      debounced();
      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1);
      debounced();
      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("randomID", () => {
  it("produces short alphanumeric ids", () => {
    expect(randomID()).toMatch(/^[a-z0-9]{1,9}$/);
  });
});

describe("notebookNameFromGitURL", () => {
  it("names a notebook after the repository in its git URL", () => {
    expect(
      notebookNameFromGitURL("https://github.com/0xGG/crossnote-app.git"),
    ).toBe("crossnote-app");
    expect(notebookNameFromGitURL("https://example.com/notes")).toBe("notes");
  });

  it("keeps .git that is part of the repository's name", () => {
    expect(
      notebookNameFromGitURL("https://github.com/alice/alice.github.io.git"),
    ).toBe("alice.github.io");
  });

  it("looks past a slash at the end of the URL", () => {
    expect(notebookNameFromGitURL("https://example.com/alice/notes/")).toBe(
      "notes",
    );
    expect(notebookNameFromGitURL("https://example.com/alice/notes.git/")).toBe(
      "notes",
    );
  });
});
