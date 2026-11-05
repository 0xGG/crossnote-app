// Prism, the code highlighter, from npm: its core the first time a note has
// a code block, and each language the first time a block is written in it,
// after the languages it builds on.
import components from "prismjs/components.json";

type Language = {
  alias?: string | string[];
  require?: string | string[];
  optional?: string | string[];
  modify?: string | string[];
};

const languages = components.languages as unknown as Record<string, Language>;

const list = (value?: string | string[]) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Each language Prism has, by its name and by its other names.
const ids = new Map<string, string>();
for (const [id, language] of Object.entries(languages)) {
  if (id === "meta") {
    continue;
  }
  ids.set(id, id);
  for (const alias of list(language.alias)) {
    ids.set(alias, id);
  }
}

const files = import.meta.glob<unknown>([
  "/node_modules/prismjs/components/prism-*.min.js",
  "!/node_modules/prismjs/components/prism-core.min.js",
]);
const file = (id: string) =>
  files[`/node_modules/prismjs/components/prism-${id}.min.js`];

let core: Promise<any> | undefined;

function loadCore(): Promise<any> {
  core ??= (async () => {
    // Highlights only what it is asked to, not the page when it loads.
    (window as any).Prism = { manual: true };
    await import("prismjs/components/prism-core");
    return (window as any).Prism;
  })();
  return core;
}

// A language's file runs against the Prism it finds on the page, and wants
// the languages it requires, uses when they are there, or changes, already
// in it.
function before(id: string): string[] {
  const language = languages[id];
  return [
    ...list(language.require),
    ...list(language.optional),
    ...list(language.modify),
  ].filter((other) => other !== "meta" && other in languages && file(other));
}

// The language and those it builds on, theirs before them, each once.
function inOrder(id: string, seen = new Set<string>(), order: string[] = []) {
  if (!seen.has(id)) {
    seen.add(id);
    for (const other of before(id)) {
      inOrder(other, seen, order);
    }
    order.push(id);
  }
  return order;
}

// The files run one after another, in the order they were asked for, so a
// language never runs before one it builds on, whichever block asked first;
// and not at all after one of those failed to load, as a language's file
// can add to Prism what then fails for every language without it.
let queue: Promise<unknown> = Promise.resolve();
const scheduled = new Map<string, Promise<void>>();

function loadFile(id: string): Promise<void> {
  let loading = scheduled.get(id);
  if (!loading) {
    const first = before(id).map((other) => scheduled.get(other));
    loading = queue.then(async () => {
      await loadCore();
      await Promise.all(first);
      await file(id)();
    });
    scheduled.set(id, loading);
    queue = loading.catch(() => {});
  }
  return loading;
}

async function loadLanguage(id: string): Promise<void> {
  await Promise.all(inOrder(id).map(loadFile));
}

/**
 * Prism with the language of that name, or one of its other names, in it;
 * undefined for a language Prism does not have, or one that could not be
 * loaded.
 */
export async function prismWith(name: string): Promise<any | undefined> {
  const id = ids.get(name);
  if (!id || !file(id)) {
    return undefined;
  }
  try {
    await loadLanguage(id);
  } catch {
    return undefined;
  }
  const prism = await loadCore();
  return name in prism.languages ? prism : undefined;
}
