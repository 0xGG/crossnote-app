import { afterEach, describe, expect, it, vi } from "vitest";
import { previewTimeout } from "./drawing";
import { printPreview } from "./print";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// The note's element, placed relatively as the page has it before printing.
function noteElement(): HTMLElement {
  const element = document.createElement("div");
  element.style.position = "relative";
  document.body.appendChild(element);
  return element;
}

describe("printPreview", () => {
  it("covers the page while the note is drawn, prints it as soon as it is, and puts everything back", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const element = noteElement();
    const banner = document.createElement("div");
    let finish = () => {};
    const printed = printPreview(
      element,
      banner,
      new Promise<void>((resolve) => (finish = resolve)),
    );
    expect(banner.isConnected).toBe(true);
    expect(element.style.position).toBe("absolute");
    await vi.advanceTimersByTimeAsync(5000);
    expect(print).not.toHaveBeenCalled();
    finish();
    // No wait of its own once the note is drawn.
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledTimes(1);
    await printed;
    expect(banner.isConnected).toBe(false);
    expect(element.style.position).toBe("relative");
    expect(document.querySelectorAll("style")).toHaveLength(0);
    // The limit's timer goes with it.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("puts the page back without printing when the note cannot be drawn", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const element = noteElement();
    const banner = document.createElement("div");
    const printed = printPreview(
      element,
      banner,
      Promise.reject(new Error("The note could not be drawn")),
    );
    await expect(printed).rejects.toThrow("could not be drawn");
    expect(print).not.toHaveBeenCalled();
    expect(banner.isConnected).toBe(false);
    expect(element.style.position).toBe("relative");
    expect(element.style.top).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("puts the page back when the print dialog fails to open", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("Printing is not allowed here");
    });
    const element = noteElement();
    const banner = document.createElement("div");
    await expect(
      printPreview(element, banner, Promise.resolve()),
    ).rejects.toThrow("not allowed");
    expect(banner.isConnected).toBe(false);
    expect(element.style.position).toBe("relative");
  });

  // Where print() returns with the dialog still open, the note has to stay
  // over the page until the dialog closes, or the dialog prints the app.
  it("puts the page back once a dialog that does not hold the page up closes", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    const element = noteElement();
    const banner = document.createElement("div");
    let done = false;
    const printed = printPreview(element, banner, Promise.resolve()).then(
      () => (done = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
    expect(element.style.position).toBe("absolute");
    expect(banner.isConnected).toBe(true);

    window.dispatchEvent(new Event("afterprint"));
    await printed;
    expect(element.style.position).toBe("relative");
    expect(banner.isConnected).toBe(false);
  });

  it("takes the first click on the page for the dialog's end should afterprint not come", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    const element = noteElement();
    const printed = printPreview(
      element,
      document.createElement("div"),
      Promise.resolve(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(element.style.position).toBe("absolute");
    window.dispatchEvent(new Event("pointerdown"));
    await printed;
    expect(element.style.position).toBe("relative");
  });

  it("prints what is drawn once it has waited previewTimeout for the rest", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const element = noteElement();
    const printed = printPreview(
      element,
      document.createElement("div"),
      new Promise(() => {}),
    );
    await vi.advanceTimersByTimeAsync(previewTimeout - 100);
    expect(print).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(print).toHaveBeenCalledTimes(1);
    await printed;
    expect(element.style.position).toBe("relative");
  });

  it("is done with a drawing that fails once the limit has printed the note", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    let fail = (_error: Error) => {};
    const printed = printPreview(
      noteElement(),
      document.createElement("div"),
      new Promise((_resolve, reject) => (fail = reject)),
    );
    await vi.advanceTimersByTimeAsync(previewTimeout);
    await printed;
    expect(print).toHaveBeenCalledTimes(1);
    // Its failure, coming later, prints nothing more and is not left
    // unhandled (the test run fails on a rejection that is).
    fail(new Error("The note could not be drawn"));
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledTimes(1);
  });
});
