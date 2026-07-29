import { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

// React 18 replacement for the legacy ReactDOM.render call used by the
// EchoMD widget creators. A widget creator must return a DOM element that is
// already populated (the editor measures it immediately), so the initial
// render is flushed synchronously. The (node, container) parameter order
// matches the old ReactDOM.render signature on purpose to keep diffs small.
export function renderWidget(node: ReactElement, container: Element): Root {
  const root = createRoot(container);
  flushSync(() => {
    root.render(node);
  });
  return root;
}
