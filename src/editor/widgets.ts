import { syntaxTree } from "@codemirror/language";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import katex from "katex";
import "katex/dist/katex.min.css";
import { emojiOfShortName, renderTwemoji } from "../render/emoji";

// What the editor draws in place of a piece of a note's text while the caret
// is elsewhere. Each is equal to another of the same text, so that an editor
// drawn again keeps the element it has.

/** A formula, drawn by KaTeX as the preview draws it. */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = this.display ? "cn-math cn-math-display" : "cn-math";
    try {
      katex.render(this.tex, element, { displayMode: this.display });
    } catch (error) {
      element.classList.add("cn-math-error");
      element.textContent = String(error);
    }
    return element;
  }

  // A click on it is the editor's: the caret goes there, and the formula's
  // text shows.
  ignoreEvent() {
    return false;
  }
}

/** An emoji written as a :short name:, drawn as the preview draws emoji. */
export class EmojiWidget extends WidgetType {
  constructor(readonly shortName: string) {
    super();
  }

  /** Whether a short name is one the app draws. */
  static knows(shortName: string) {
    return emojiOfShortName(shortName) !== undefined;
  }

  eq(other: EmojiWidget) {
    return other.shortName === this.shortName;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "cn-emoji";
    element.title = `:${this.shortName}:`;
    element.textContent = emojiOfShortName(this.shortName) ?? "";
    renderTwemoji(element);
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

/** What a note says of an image: `![alt](src "title")`. */
export interface ImageMarkup {
  alt: string;
  src: string;
  title: string;
}

export interface ImageHost {
  /** Gives an image element what to show for an address in a note. */
  loadImage?: (element: HTMLImageElement, src: string) => void;
  /** A click on an image; from and to are where its markup is now. */
  onImageClick?: (
    image: ImageMarkup & { from: number; to: number },
    element: HTMLImageElement,
  ) => void;
}

/** An image, in place of its markup. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly image: ImageMarkup,
    readonly host: ImageHost,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      other.image.src === this.image.src &&
      other.image.alt === this.image.alt &&
      other.image.title === this.image.title &&
      other.host === this.host
    );
  }

  toDOM(view: EditorView) {
    const element = document.createElement("img");
    element.className = "cn-image";
    element.alt = this.image.alt;
    if (this.image.title) {
      element.title = this.image.title;
    }
    // The line is as tall as the picture once the picture is there.
    element.addEventListener("load", () => view.requestMeasure());
    element.addEventListener("error", () => view.requestMeasure());
    if (this.host.loadImage) {
      this.host.loadImage(element, this.image.src);
    } else {
      element.src = this.image.src;
    }
    element.addEventListener("mousedown", (event) => {
      if (!this.host.onImageClick || event.button !== 0) {
        return;
      }
      event.preventDefault();
      let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(
        view.posAtDOM(element),
        1,
      );
      while (node && node.name !== "Image") {
        node = node.parent;
      }
      if (node) {
        this.host.onImageClick(
          { ...this.image, from: node.from, to: node.to },
          element,
        );
      }
    });
    return element;
  }

  // The image answers its own clicks, where the app asked to be told of
  // them; otherwise the caret goes to it and its markup shows.
  ignoreEvent(event: Event) {
    return !!this.host.onImageClick && event.type === "mousedown";
  }
}

/** A task's box, in place of its "[ ]" or "[x]": a click ticks or clears it. */
export class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("input");
    element.type = "checkbox";
    element.className = "cn-task";
    element.checked = this.checked;
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", (event) => {
      event.preventDefault();
      if (view.state.readOnly) {
        return;
      }
      const from = view.posAtDOM(element);
      const box = /^\[([ xX])\]/.exec(view.state.sliceDoc(from, from + 3));
      if (box) {
        view.dispatch({
          changes: {
            from: from + 1,
            to: from + 2,
            insert: box[1] === " " ? "x" : " ",
          },
          userEvent: "input",
        });
      }
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}
