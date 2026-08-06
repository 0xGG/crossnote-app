import { describe, expect, it, vi } from "vitest";
import { formatDate, RandomColorGenerator, randomID } from "./utils";

describe("formatDate", () => {
  it("returns an empty string for empty input", () => {
    expect(formatDate("")).toBe("");
  });

  it("formats dates within an hour as ceiled minutes", () => {
    // 9.5 minutes ago ceils to exactly 10m; the half-minute slack absorbs
    // the wall-clock time that passes between here and the implementation.
    const d = new Date(Date.now() - 9.5 * 60 * 1000).toISOString();
    expect(formatDate(d)).toBe("10m");
  });

  it("formats dates within a day as floored hours", () => {
    const d = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    expect(formatDate(d)).toBe("1h");
  });

  it("prefixes dates in the future", () => {
    const d = new Date(Date.now() + 9.5 * 60 * 1000).toISOString();
    expect(formatDate(d)).toBe("future 10m");
  });

  it("formats older dates as month day year", () => {
    const d = new Date("2020-01-15T12:00:00Z").toISOString();
    expect(formatDate(d)).toBe("Jan 15 2020");
  });
});

describe("RandomColorGenerator", () => {
  it("derives the color from the key, stable across instances", () => {
    // Two fresh instances bypass the per-instance memo cache, so this pins
    // the hash itself; the literal value guards the color assignment users
    // see across sessions.
    expect(new RandomColorGenerator().generateColor("abc")).toBe("#f6aa8e");
    expect(new RandomColorGenerator().generateColor("abc")).toBe("#f6aa8e");
  });

  it("hashes a key only once per instance", () => {
    // Spy on the derivation itself: comparing two return values cannot tell
    // memoization apart from a deterministic recompute.
    const generator = new RandomColorGenerator();
    const hashCode = vi.spyOn(
      generator as unknown as { hashCode: (s: string) => number },
      "hashCode",
    );
    generator.generateColor("abc");
    generator.generateColor("abc");
    expect(hashCode).toHaveBeenCalledTimes(1);
  });
});

describe("randomID", () => {
  it("produces short alphanumeric ids", () => {
    expect(randomID()).toMatch(/^[a-z0-9]{1,9}$/);
  });
});
