import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

export function mountTestRoot(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

export function unmountTestRoot(container: HTMLDivElement, root: Root): void {
  act(() => root.unmount());
  container.remove();
}

export function buttonByText(
  scope: ParentNode,
  text: string,
): HTMLButtonElement {
  return Array.from(scope.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  );
}

export function typeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
