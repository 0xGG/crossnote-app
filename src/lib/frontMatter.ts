import YAML from "yamljs";

// A note's front matter is the user's, but for the settings the notebook
// keeps in it. Those come out of the text an editor shows, and go back in
// after the rest when the note is saved; everything else is written back
// exactly as it was given. YAML is only read here, to find the settings and
// to make sure the rest reads the same without them: written out anew, the
// user's YAML would change, as yamljs reads 0123 as an octal number, 1.10 as
// 1.1 and a date as a time, and drops comments.

/** The settings a note keeps in its front matter, in the order a new one is written. */
export const NOTE_SETTINGS = [
  "aliases",
  "pinned",
  "favorited",
  "icon",
  "created",
  "modified",
];
// The older form of the settings, all of them under one key, which saving
// still turns into the newer.
const OLDER_SETTINGS = "note";

const BOM = "\uFEFF";

type Mapping = Record<string, unknown>;

interface Block {
  // The line that opens the front matter, the lines in it and the line that
  // closes it, each with its line ending; and the text after it.
  open: string;
  lines: string[];
  close: string;
  rest: string;
  eol: string;
}

interface Setting {
  key: string;
  lines: string[];
  value: unknown;
}

// Front matter opens on the first line and closes on a later one, each
// nothing but three dashes. A rule of four dashes, or one with text after
// it, is the note's text.
function findBlock(text: string): Block | null {
  const open = /^---[ \t]*(\r?\n)/.exec(text);
  if (!open) {
    return null;
  }
  const lines: string[] = [];
  let start = open[0].length;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline + 1;
    const line = text.slice(start, end);
    if (/^---[ \t]*\r?\n?$/.test(line)) {
      return {
        open: open[0],
        lines,
        close: line,
        rest: text.slice(end),
        eol: open[1],
      };
    }
    lines.push(line);
    start = end;
  }
  return null;
}

// The mapping YAML reads in these lines: null when they read as something
// else, such as a paragraph or a list between two rules, and undefined when
// YAML cannot read them.
function readMapping(lines: string[]): Mapping | null | undefined {
  let value: unknown;
  try {
    value = YAML.parse(lines.join(""));
  } catch (error) {
    return undefined;
  }
  if (value === null || value === undefined) {
    // Nothing but blank lines and comments is an empty mapping; `~` on its
    // own is a value.
    return lines.every((line) => /^\s*(#.*)?\s*$/.test(line)) ? {} : null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Mapping;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date &&
      b instanceof Date &&
      Object.is(a.getTime(), b.getTime())
    );
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameValue(item, b[i]))
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          sameValue((a as Mapping)[key], (b as Mapping)[key]),
      )
    );
  }
  return Object.is(a, b);
}

// The lines of front matter with the settings named taken out, and the
// settings, each with its lines: a setting's key at the start of a line and
// the indented lines after it. Null when they do not come apart that way, as
// a setting given twice, a mapping written on one line or an anchor shared
// with a setting would not: the lines left out have to read as the settings
// did, and the lines left as the rest of the mapping.
function splitSettings(
  lines: string[],
  mapping: Mapping,
  keys: string[],
): { rest: string[]; settings: Setting[] } | null {
  const settingLine = new RegExp(
    `^(["']?)(${keys.join("|")})\\1[ \\t]*:(?:[ \\t]|\\r?\\n|$)`,
  );
  const rest: string[] = [];
  const settings: Setting[] = [];
  let setting: Setting | null = null;
  // Blank lines go with a setting only if more of it follows them.
  let blank: string[] = [];
  for (const line of lines) {
    const match = settingLine.exec(line);
    if (match) {
      rest.push(...blank);
      blank = [];
      setting = { key: match[2], lines: [line], value: undefined };
      settings.push(setting);
    } else if (setting && /^[ \t]*\r?\n?$/.test(line)) {
      blank.push(line);
    } else if (setting && /^([ \t]|-([ \t]|\r?\n|$))/.test(line)) {
      // Indented, or a list item, which YAML lets start at the key's own
      // indentation.
      setting.lines.push(...blank, line);
      blank = [];
    } else {
      rest.push(...blank, line);
      blank = [];
      setting = null;
    }
  }
  rest.push(...blank);

  const taken = new Set<string>();
  for (const { key } of settings) {
    if (taken.has(key)) {
      return null;
    }
    taken.add(key);
  }
  for (const setting of settings) {
    const alone = readMapping(setting.lines);
    if (
      !alone ||
      Object.keys(alone).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(alone, setting.key) ||
      !sameValue(alone[setting.key], mapping[setting.key])
    ) {
      return null;
    }
    setting.value = alone[setting.key];
  }
  const left = readMapping(rest);
  const expected: Mapping = {};
  for (const key of Object.keys(mapping)) {
    if (!taken.has(key)) {
      expected[key] = mapping[key];
    }
  }
  if (!left || !sameValue(left, expected)) {
    return null;
  }
  return { rest, settings };
}

// The names the older form of the settings gave them.
const OLDER_KEYS = [...NOTE_SETTINGS, "createdAt", "modifiedAt"];

// Whether a `note` key holds the older form of the settings, rather than
// something of the user's own that happens to be called that.
function olderSettings(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).every((key) => OLDER_KEYS.includes(key))
  );
}

// The front matter a text starts with, its settings named taken out.
function readFrontMatter(text: string, keys: string[]) {
  const bom = text.startsWith(BOM) ? BOM : "";
  const block = findBlock(text.slice(bom.length));
  const mapping = block ? readMapping(block.lines) : null;
  const split = mapping
    ? splitSettings(
        block.lines,
        mapping,
        keys.filter(
          (key) =>
            key !== OLDER_SETTINGS || olderSettings(mapping[OLDER_SETTINGS]),
        ),
      )
    : null;
  return { bom, block, unreadable: mapping === undefined, split };
}

export interface NoteText {
  /** The note as an editor shows it: its front matter less the settings. */
  text: string;
  /** The settings its front matter holds, as YAML reads them. */
  settings: Mapping;
  /** Whether it starts with front matter YAML cannot read. */
  unreadable: boolean;
}

/**
 * A note's text and settings, from its file. Front matter that YAML cannot
 * read, or that is not a mapping, is the note's text like the rest of it.
 * @param keys the settings to take out of the text
 */
export function readNoteText(file: string, keys = NOTE_SETTINGS): NoteText {
  const { bom, block, unreadable, split } = readFrontMatter(file, keys);
  if (!split) {
    return { text: file, settings: {}, unreadable };
  }
  const settings: Mapping = {};
  for (const { key, value } of split.settings) {
    settings[key] = value;
  }
  // Front matter that held only settings is gone from the text, and saving
  // puts it back.
  const text = split.rest.every((line) => /^\s*$/.test(line))
    ? bom + block.rest
    : bom + block.open + split.rest.join("") + block.close + block.rest;
  return { text, settings, unreadable: false };
}

// Two values of a setting that mean the same: a date however it is written,
// aliases in a line or a list.
function sameSetting(key: string, a: unknown, b: unknown): boolean {
  const meaning = (value: unknown) => {
    if (key === "created" || key === "modified") {
      const time =
        value instanceof Date
          ? value.getTime()
          : typeof value === "string"
            ? Date.parse(value)
            : NaN;
      return Number.isNaN(time) ? value : time;
    }
    if (key === "aliases" && typeof value === "string") {
      return value.split(",").map((alias) => alias.trim());
    }
    return value;
  };
  return sameValue(meaning(a), meaning(b));
}

/**
 * A note's file, from the text an editor gave and the note's settings: the
 * text as it is, with the settings after the rest of its front matter. A
 * setting that means what the file held before is written as it was, in the
 * place it had among the settings. A text whose front matter cannot take
 * them, as one YAML cannot read, keeps it as it is, and the settings go in
 * front matter of their own before it.
 * @param settings the settings, in the order a new one is written
 * @param previous the file as it was, if there was one
 */
export function writeNoteText(
  text: string,
  settings: [string, unknown][],
  previous: string | null,
): string {
  const { bom, block, split } = readFrontMatter(text, [
    ...NOTE_SETTINGS,
    OLDER_SETTINGS,
  ]);
  const body = text.slice(bom.length);

  const values = new Map(settings);
  // Settings typed into the text count where the note's settings have none.
  const typed = new Map<string, Setting>();
  for (const setting of split ? split.settings : []) {
    if (setting.key === OLDER_SETTINGS) {
      // Taken out only when it is that form: a mapping of settings.
      for (const [key, value] of Object.entries(setting.value as Mapping)) {
        values.set(
          key === "createdAt"
            ? "created"
            : key === "modifiedAt"
              ? "modified"
              : key,
          value,
        );
      }
    } else {
      typed.set(setting.key, setting);
      if (!values.has(setting.key)) {
        values.set(setting.key, setting.value);
      }
    }
  }
  for (const [key, value] of values) {
    if (value === undefined || value === null) {
      values.delete(key);
    }
  }

  const before = previous
    ? (readFrontMatter(previous, NOTE_SETTINGS).split?.settings ?? [])
    : [];
  const order = [
    ...before.map(({ key }) => key).filter((key) => values.has(key)),
    ...[...values.keys()].filter((key) => !before.some((s) => s.key === key)),
  ];
  const eol = block ? block.eol : (/\r?\n/.exec(body)?.[0] ?? "\n");
  const written: string[] = [];
  for (const key of order) {
    const value = values.get(key);
    const same = [typed.get(key), before.find((s) => s.key === key)].find(
      (setting) => setting && sameSetting(key, setting.value, value),
    );
    const lines = same
      ? same.lines
      : YAML.stringify({ [key]: value }).split(/(?<=\n)/);
    written.push(...lines.map((line) => line.replace(/\r?\n$/, "") + eol));
  }

  if (split) {
    const lines = [...split.rest, ...written];
    // Written after the rest, the settings have to read as they are, and
    // the rest as it did.
    const together = readMapping(lines);
    const rest = readMapping(split.rest);
    const own = readMapping(written);
    if (together && rest && own && sameValue(together, { ...rest, ...own })) {
      return bom + block.open + lines.join("") + block.close + block.rest;
    }
  }
  if (!written.length) {
    return text;
  }
  return bom + "---" + eol + written.join("") + "---" + eol + body;
}
