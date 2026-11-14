import {
  ChartTimeline,
  ClockOutline,
  FormatHeader1,
  FormatHeader2,
  FormatHeader3,
  FormatHeader4,
  FormatHeader5,
  FormatHeader6,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuoteOpen,
  Table,
} from "mdi-material-ui";
import React from "react";
import { createRoot } from "react-dom/client";

// What the app gives the editor's "/" menu for each command: the key of its
// description in the language files, and its picture.
const COMMANDS: Record<
  string,
  { description: string; Icon: React.ComponentType<{ fontSize?: "small" }> }
> = {
  h1: { description: "editor/toolbar/insert-header-1", Icon: FormatHeader1 },
  h2: { description: "editor/toolbar/insert-header-2", Icon: FormatHeader2 },
  h3: { description: "editor/toolbar/insert-header-3", Icon: FormatHeader3 },
  h4: { description: "editor/toolbar/insert-header-4", Icon: FormatHeader4 },
  h5: { description: "editor/toolbar/insert-header-5", Icon: FormatHeader5 },
  h6: { description: "editor/toolbar/insert-header-6", Icon: FormatHeader6 },
  blockquote: {
    description: "editor/toolbar/insert-blockquote",
    Icon: FormatQuoteOpen,
  },
  ul: {
    description: "editor/toolbar/insert-unordered-list",
    Icon: FormatListBulleted,
  },
  ol: {
    description: "editor/toolbar/insert-ordered-list",
    Icon: FormatListNumbered,
  },
  table: { description: "editor/toolbar/insert-table", Icon: Table },
  now: { description: "editor/toolbar/insert-date-time", Icon: ClockOutline },
  mermaid: {
    description: "editor/toolbar/insert-mermaid",
    Icon: ChartTimeline,
  },
};

/** The key of a command's description in the language files. */
export function slashCommandDescription(name: string): string | undefined {
  return COMMANDS[name]?.description;
}

// The menu is drawn by the editor, outside React, each time it opens or
// what is typed changes. Each picture is drawn once, into an element that is
// kept, and the menu gets a copy of it.
const drawn = new Map<string, HTMLElement>();

/** Draws the pictures, so that they are there when the menu first opens. */
export function prepareSlashCommandIcons() {
  for (const [name, { Icon }] of Object.entries(COMMANDS)) {
    if (!drawn.has(name)) {
      const element = document.createElement("span");
      drawn.set(name, element);
      createRoot(element).render(<Icon fontSize="small" />);
    }
  }
}

/** Puts a command's picture in an element of the menu. */
export function drawSlashCommandIcon(name: string, into: HTMLElement) {
  const picture = drawn.get(name)?.firstElementChild;
  if (picture) {
    into.appendChild(picture.cloneNode(true));
  }
}
