import { afterEach, describe, expect, it, vi } from "vitest";
import { isDarkPreview, startDrawing, waitForDrawing } from "./drawing";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-preview-theme");
  vi.useRealTimers();
});

describe("startDrawing", () => {
  it("starts drawing once its element can be put in the page", async () => {
    const element = document.createElement("div");
    let connected: boolean | undefined;
    const drawing = startDrawing(element, () => {
      connected = element.isConnected;
    });
    document.body.appendChild(element);
    await drawing.done;
    expect(connected).toBe(true);
  });

  it("shows what the drawing failed with in its place, and settles", async () => {
    const element = document.createElement("div");
    const drawing = startDrawing(element, async () => {
      throw new Error("cannot draw this");
    });
    await drawing.done;
    expect(element.querySelector(".language-error")?.textContent).toBe(
      "Error: cannot draw this",
    );
  });

  it("does not start a drawing disposed of first", async () => {
    const draw = vi.fn();
    const drawing = startDrawing(document.createElement("div"), draw);
    drawing.dispose();
    await drawing.done;
    expect(draw).not.toHaveBeenCalled();
  });

  it("tells a drawing under way that it is disposed of, settles, and shows nothing it fails with then", async () => {
    const element = document.createElement("div");
    let fail: (error: Error) => void;
    let signal: AbortSignal;
    const drawing = startDrawing(element, (drawSignal) => {
      signal = drawSignal;
      return new Promise<void>((_, reject) => (fail = reject));
    });
    await Promise.resolve();
    await Promise.resolve();
    drawing.dispose();
    await drawing.done;
    expect(signal.aborted).toBe(true);
    fail(new Error("too late"));
    await new Promise((resolve) => setTimeout(resolve));
    expect(element.childNodes.length).toBe(0);
  });
});

describe("waitForDrawing", () => {
  it("gives up on a drawing that takes too long: disposes of it and says so", async () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    let signal: AbortSignal;
    const drawing = startDrawing(element, (drawSignal) => {
      signal = drawSignal;
      return new Promise(() => {});
    });
    const { settled } = waitForDrawing(drawing, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    expect(signal.aborted).toBe(true);
    expect(element.textContent).toBe(
      "Error: this block took more than 1 seconds to draw",
    );
  });

  it("gives a drawing that waits its turn its time from its turn", async () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    let begin = () => {};
    const drawing = startDrawing(
      element,
      (_signal, beginDrawing) => {
        begin = beginDrawing;
        return new Promise(() => {});
      },
      { waitsItsTurn: true },
    );
    const { settled } = waitForDrawing(drawing, 1000);
    // Waiting behind others of its kind.
    await vi.advanceTimersByTimeAsync(5000);
    expect(element.textContent).toBe("");
    begin();
    await vi.advanceTimersByTimeAsync(999);
    expect(element.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(element.textContent).toBe(
      "Error: this block took more than 1 seconds to draw",
    );
  });

  it("leaves what a drawing that keeps what it shows shows when it gives up on it", async () => {
    vi.useFakeTimers();
    const element = document.createElement("pre");
    element.textContent = "let a = 1;";
    let signal: AbortSignal;
    const drawing = startDrawing(
      element,
      (drawSignal) => {
        signal = drawSignal;
        return new Promise(() => {});
      },
      { keepsWhatItShows: true },
    );
    const { settled } = waitForDrawing(drawing, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    expect(signal.aborted).toBe(true);
    expect(element.textContent).toBe("let a = 1;");
  });

  it("settles when told to stop waiting", async () => {
    const drawing = startDrawing(
      document.createElement("div"),
      () => new Promise(() => {}),
    );
    const wait = waitForDrawing(drawing);
    wait.stop();
    await wait.settled;
  });
});

describe("isDarkPreview", () => {
  it("follows the theme on the page, or the one around the preview", () => {
    const element = document.createElement("div");
    const around = document.createElement("div");
    around.appendChild(element);
    document.body.appendChild(around);
    document.documentElement.setAttribute("data-preview-theme", "one-dark");
    expect(isDarkPreview(element)).toBe(true);
    // One being printed is light.
    around.setAttribute("data-preview-theme", "light");
    expect(isDarkPreview(element)).toBe(false);
  });
});
