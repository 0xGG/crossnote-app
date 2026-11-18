import { expect, it } from "vitest";
import { emojiOfShortName, emojiShortNames, renderTwemoji } from "./emoji";

it("keeps the short names and meanings used by existing notes", () => {
  expect(emojiShortNames()).toHaveLength(1714);
  expect(emojiOfShortName("beetle")).toBe("🐞");
  expect(emojiOfShortName("man_in_tuxedo")).toBe("🤵");
  expect(emojiOfShortName("constructor")).toBeUndefined();
});

it("draws whole emoji clusters and leaves plain text and unsupported clusters intact", () => {
  const element = document.createElement("div");
  element.textContent = "☝️ 😄 🏋️ 🤵🏿 © 🫪";
  renderTwemoji(element);
  expect(Array.from(element.querySelectorAll("img"), (img) => img.alt)).toEqual(
    ["☝️", "😄", "🏋️", "🤵🏿"],
  );
  expect(element.textContent).toBe("    © 🫪");
});

it("names emoji by their character, historical short name and accessible aliases", () => {
  const element = document.createElement("div");
  element.textContent = "📝 👍 🐞";
  renderTwemoji(element);
  expect(
    Array.from(element.querySelectorAll("img"), (image) =>
      image.getAttribute("aria-label"),
    ),
  ).toEqual(["📝, memo, pencil", "👍, +1, thumbsup", "🐞, beetle"]);
  expect(emojiOfShortName("thumbsup")).toBeUndefined();
});
