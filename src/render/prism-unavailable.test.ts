import { expect, it, vi } from "vitest";
import { mountPreview } from "./index";

// A file of its own: Prism's module cannot be loaded here, as when the
// network goes before the first code block of the session.
vi.mock("./prism", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

it("shows code as it is when Prism cannot be loaded", async () => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  await mountPreview(element, "```js\nlet a = 1;\n```\n", { note: null }).done;
  const block = element.querySelector("pre");
  expect(block.textContent).toBe("let a = 1;\n");
  expect(block.classList.contains("language-text")).toBe(true);
  expect(element.querySelector(".language-error")).toBeNull();
});
