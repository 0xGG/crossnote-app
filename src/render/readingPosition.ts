export interface ReadingPosition {
  /** Zero-based source line, and the block's top relative to the viewport. */
  line: number;
  offset: number;
}

function sourceLine(element: HTMLElement) {
  return element.dataset.sourceLine ?? element.dataset.line ?? "";
}

function blocks(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      "[data-source-line], [data-line]:not(input)",
    ),
  ).filter(
    (block) => block.getClientRects().length && /^\d+$/.test(sourceLine(block)),
  );
}

export function previewPosition(element: HTMLElement): ReadingPosition {
  if (element.scrollTop === 0) return { line: 0, offset: 0 };
  const top = element.getBoundingClientRect().top;
  const candidates = blocks(element);
  const visible = candidates.filter(
    (block) => block.getBoundingClientRect().bottom > top,
  );
  // Prefer the innermost block at the top, rather than its whole list/quote.
  const block =
    visible
      .filter((block) => block.getBoundingClientRect().top <= top + 4)
      .pop() ?? visible[0];
  return block
    ? {
        line: Number(sourceLine(block)),
        offset: block.getBoundingClientRect().top - top,
      }
    : { line: 0, offset: 0 };
}

/** Keep the anchor through image/diagram layout, until the user navigates. */
export function restorePreviewPosition(
  element: HTMLElement,
  position: ReadingPosition,
): () => void {
  let active = true;
  const restore = () => {
    if (!active) return;
    if (position.line === 0 && position.offset === 0) {
      element.scrollTop = 0;
      return;
    }
    const candidates = blocks(element);
    const before = candidates.filter(
      (block) => Number(sourceLine(block)) <= position.line,
    );
    // Renderers may move source blocks, such as footnote definitions, to the
    // end of the DOM. Choose the nearest source line, not the last DOM node.
    const block =
      before.reduce<HTMLElement | undefined>(
        (nearest, candidate) =>
          !nearest ||
          Number(sourceLine(candidate)) >= Number(sourceLine(nearest))
            ? candidate
            : nearest,
        undefined,
      ) ?? candidates[0];
    if (block) {
      const rect = block.getBoundingClientRect();
      // A long source paragraph or diagram can shrink in preview. Keep its
      // anchor visible when the old displacement would skip the whole block.
      const offset = position.offset <= -rect.height ? 0 : position.offset;
      element.scrollTop +=
        rect.top - element.getBoundingClientRect().top - offset;
    }
  };
  const observer = new ResizeObserver(restore);
  const stop = () => {
    active = false;
    observer.disconnect();
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
      element.removeEventListener(event, stop);
  };
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
    element.addEventListener(event, stop, { passive: true });
  for (const child of element.children) observer.observe(child);
  restore();
  return stop;
}
