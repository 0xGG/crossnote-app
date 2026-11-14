import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  emojiOfShortName,
  emojiShortNames,
  renderTwemoji,
} from "../render/emoji";

// What the editor offers as a note is typed: commands after "/", emoji after
// ":", the notebook's tags after "#" and its notes inside "[[". The editor
// knows when to offer and what to put in the text; the words, the pictures
// and the notebook's own lists come from the app.

/** A command of the "/" menu. */
export interface SlashCommand {
  /** What is typed after the slash: "h1", "table". */
  name: string;
  /** The text it puts in place of what was typed. */
  insert: string | ((now: Date) => string);
  /** Where the caret goes in that text, from its start; its end if left out. */
  caret?: number;
}

const two = (value: number) => String(value).padStart(2, "0");

/** A date as the "/now" command writes it: local time, to the minute. */
export function dateTime(now: Date) {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
}

/** The commands of the "/" menu, in the order they are listed. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "h1", insert: "# " },
  { name: "h2", insert: "## " },
  { name: "h3", insert: "### " },
  { name: "h4", insert: "#### " },
  { name: "h5", insert: "##### " },
  { name: "h6", insert: "###### " },
  { name: "blockquote", insert: "> " },
  { name: "ul", insert: "* " },
  { name: "ol", insert: "1. " },
  { name: "table", insert: "|   |   |\n|---|---|\n|   |   |\n", caret: 2 },
  { name: "now", insert: dateTime },
  {
    name: "mermaid",
    insert: "```mermaid\ngraph TD\n    A --> B\n```\n",
    caret: "```mermaid\ngraph TD\n    A --> B".length,
  },
];

export interface CompletionHost {
  /** What a command of the "/" menu is called, in the user's language. */
  describeCommand?: (name: string) => string;
  /** Draws a command's picture into an element. */
  drawCommandIcon?: (name: string, into: HTMLElement) => void;
  /** The notebook's tags for what is typed after "#", each as it is written. */
  tags?: (typed: string) => string[];
  /**
   * The notebook's notes for what is typed after "[[", each as the whole
   * link to write: "[[note]]", "[[folder/note.md|note]]".
   */
  wikiLinks?: (typed: string) => string[];
  /** The time the "/now" command writes; the present if left out. */
  now?: () => Date;
}

// The text of the caret's line up to the caret.
function before(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  return { line, text: line.text.slice(0, context.pos - line.from) };
}

// "/" at the start of a line or after white space, and the word after it. A
// slash in a path, an address or a tag is not one.
function slashCommands(host: CompletionHost): CompletionSource {
  return (context) => {
    const { text } = before(context);
    const found = /(?:^|\s)\/([^\s/]*)$/.exec(text);
    if (!found) {
      return null;
    }
    const typed = found[1].toLocaleLowerCase();
    const from = context.pos - found[1].length - 1;
    const all = SLASH_COMMANDS.map((command): Completion & { hay: string } => {
      const detail = host.describeCommand?.(command.name) ?? "";
      return {
        label: `/${command.name}`,
        detail,
        type: `command-${command.name}`,
        hay: `/${command.name}${detail}`.toLocaleLowerCase(),
        apply: (view, _completion, start, end) => {
          const insert =
            typeof command.insert === "string"
              ? command.insert
              : command.insert(host.now?.() ?? new Date());
          view.dispatch({
            changes: { from: start, to: end, insert },
            selection: { anchor: start + (command.caret ?? insert.length) },
            scrollIntoView: true,
            userEvent: "input.complete",
          });
        },
      };
    });
    // By the command or by what it is called; all of them when none fits.
    const fitting = all.filter(({ hay }) => hay.includes(typed));
    return {
      from,
      options: fitting.length ? fitting : all,
      filter: false,
    };
  };
}

// ":" or "::" and the start of a short name, at the start of a line or after
// anything but a letter, a digit or a colon (the colon of a time or an
// address is not one). One colon puts the emoji itself in the text, two the
// short name between colons.
let emojiOptions: { one: Completion[]; two: Completion[] } | null = null;

function emoji(): CompletionSource {
  return (context) => {
    const { text } = before(context);
    const found = /(?:^|[^\w:])(::?)([\w+-]+)$/.exec(text);
    if (!found) {
      return null;
    }
    if (!emojiOptions) {
      const names = emojiShortNames();
      emojiOptions = {
        one: names.map((name) => ({
          label: `:${name}:`,
          type: "emoji",
          apply: `${emojiOfShortName(name)} `,
        })),
        two: names.map((name) => ({
          label: `::${name}:`,
          displayLabel: `:${name}:`,
          type: "emoji",
          apply: `:${name}: `,
        })),
      };
    }
    return {
      from: context.pos - found[2].length - found[1].length,
      options: found[1].length === 2 ? emojiOptions.two : emojiOptions.one,
      validFor: /^::?[\w+-]*$/,
    };
  };
}

function listed(
  from: number,
  to: number | undefined,
  texts: string[],
): CompletionResult | null {
  return texts.length
    ? {
        from,
        to,
        options: texts.map((label) => ({ label, type: "note" })),
        // The notebook chose them; they are not sifted again.
        filter: false,
      }
    : null;
}

// "#" at the start of a line or after white space, and what follows it.
function tags(host: CompletionHost): CompletionSource {
  return (context) => {
    const { text } = before(context);
    const found = /(?:^|\s)#([^\s#]*)$/.exec(text);
    if (!found || !host.tags) {
      return null;
    }
    return listed(
      context.pos - found[1].length - 1,
      undefined,
      host.tags(found[1]),
    );
  };
}

// Inside "[[", up to the caret; the rest of an existing link goes with
// what is replaced, including its closing brackets.
function wikiLinks(host: CompletionHost): CompletionSource {
  return (context) => {
    const { line, text } = before(context);
    const open = text.lastIndexOf("[[");
    if (open < 0 || !host.wikiLinks) {
      return null;
    }
    // Like the wiki parser, only an unescaped pair of closing brackets
    // ends a target; a single bracket can be part of its name.
    const closed = /^(?:\\.|[^\\])*?\]\]/.exec(line.text.slice(open + 2));
    if (closed && open + 2 + closed[0].length <= text.length) {
      return null;
    }
    return listed(
      line.from + open,
      closed ? line.from + open + 2 + closed[0].length : context.pos,
      host.wikiLinks(text.slice(open + 2)),
    );
  };
}

/** What is asked, in turn, for something to offer at the caret. */
export function completionSources(host: CompletionHost): CompletionSource[] {
  return [slashCommands(host), emoji(), tags(host), wikiLinks(host)];
}

/**
 * Completion as a note is typed, and brackets and quotes closed as they are
 * opened.
 */
export function noteCompletion(host: CompletionHost = {}): Extension {
  return [
    closeBrackets(),
    autocompletion({
      override: completionSources(host),
      icons: false,
      defaultKeymap: false,
      // Of those that fit what is typed equally well, the shortest first:
      // ":smile:" before ":smile_cat:".
      compareCompletions: (a, b) =>
        a.label.length - b.label.length || a.label.localeCompare(b.label),
      addToOptions: [
        {
          // A command's picture, or the emoji itself, before the label.
          position: 20,
          render: (completion) => {
            const type = completion.type ?? "";
            if (type.startsWith("command-")) {
              const element = document.createElement("span");
              element.className = "cn-completion-icon";
              host.drawCommandIcon?.(type.slice("command-".length), element);
              return element;
            }
            if (type === "emoji") {
              const element = document.createElement("span");
              element.className = "cn-completion-icon cn-emoji";
              const name = (completion.displayLabel ?? completion.label).slice(
                1,
                -1,
              );
              element.textContent = emojiOfShortName(name) ?? "";
              renderTwemoji(element);
              return element;
            }
            return null;
          },
        },
      ],
    }),
    // Ahead of the editor's own Enter, Tab and arrows while a list is open.
    Prec.highest(keymap.of([...closeBracketsKeymap, ...completionKeymap])),
  ];
}
