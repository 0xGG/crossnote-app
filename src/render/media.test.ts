import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mountMediaPlayer } from "./media";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("releases a source that resolves after disposal", async () => {
  let resolve!: (value: { url: string; dispose: () => void }) => void;
  const load = new Promise<{ url: string; dispose: () => void }>((done) => {
    resolve = done;
  });
  const dispose = vi.fn();
  const mounted = mountMediaPlayer("audio", "Recording", () => load);
  mounted.dispose();
  resolve({ url: "blob:late", dispose });
  await mounted.done;
  expect(dispose).toHaveBeenCalledOnce();
  expect(mounted.element.querySelector("audio")?.hasAttribute("src")).toBe(
    false,
  );
});

it("provides controls without autoplay and releases a replaced source", async () => {
  const dispose = vi.fn();
  const old = mountMediaPlayer("video", "Clip", async () => ({
    url: "blob:old",
    dispose,
  }));
  await old.done;
  const player = old.element.querySelector("video")!;
  expect(player.controls).toBe(true);
  expect(player.autoplay).toBe(false);
  old.dispose();
  expect(player.pause).toHaveBeenCalledOnce();
  expect(player.load).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(player.hasAttribute("src")).toBe(false);
  const src = "https://example.com/movie.mp4?token=a%23b";
  const next = mountMediaPlayer("video", "Clip", async () => ({
    url: src,
    dispose: () => {},
  }));
  await next.done;
  expect(next.element.querySelector("video")?.getAttribute("src")).toBe(src);
  next.dispose();
});

it("shows feedback when loading or playback fails", async () => {
  const changed = vi.fn();
  const mounted = mountMediaPlayer(
    "audio",
    "",
    async () => {
      throw new Error("failed");
    },
    changed,
  );
  await mounted.done;
  expect(
    mounted.element.querySelector('[role="status"]')?.textContent,
  ).toBeTruthy();
  expect(changed).toHaveBeenCalled();
  mounted.dispose();
});
