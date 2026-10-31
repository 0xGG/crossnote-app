// R3-0 risk check, not for main: how long a key takes to show in a long
// note, in whatever build is served (the CodeMirror 6 prototype, or main's
// CodeMirror 5 build through R3_BASE_URL). Two measures per key: the time
// from the keydown to the frame after it is painted (requestAnimationFrame,
// then a message), and the Event Timing entries Chrome reports for keys
// that took 16 ms or more. Results go in the test's annotations; the note
// is generated from a fixed seed, so every run types into the same text.
import type { CrossnoteApp, EditorHost } from "./crossnote";
import { expect, test } from "./fixtures";

// mulberry32
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A note of sections like those of a long working note: headings, prose in
// Chinese and English with inline markup, lists and tasks, code, tables,
// quotes, math, wiki links and tags.
export function longNote(sections: number, seed = 20261101): string {
  const next = random(seed);
  const pick = <T>(items: T[]) => items[Math.floor(next() * items.length)];
  const words = [
    "编辑器",
    "笔记",
    "同步",
    "预览",
    "挂件",
    "看板",
    "公式",
    "链接",
    "标题",
    "列表",
    "editor",
    "note",
    "sync",
    "preview",
    "widget",
    "board",
    "math",
    "link",
    "heading",
    "list",
    "markdown",
    "git",
    "commit",
    "release",
  ];
  const phrase = (count: number) =>
    Array.from({ length: count }, () => {
      const word = pick(words);
      const roll = next();
      if (roll < 0.06) return `**${word}**`;
      if (roll < 0.1) return `*${word}*`;
      if (roll < 0.14) return `\`${word}\``;
      if (roll < 0.17) return `[${word}](https://example.com/${word})`;
      if (roll < 0.19) return `[[${word} ${Math.floor(next() * 50)}]]`;
      if (roll < 0.2) return `#${word}`;
      if (roll < 0.21) return `$x_${Math.floor(next() * 9)}^2$`;
      return word;
    }).join(" ");
  const lines: string[] = [
    "---",
    "title: 长笔记",
    "tags: [r3-0, latency]",
    "---",
    "",
  ];
  for (let section = 1; section <= sections; section++) {
    lines.push(`## 第 ${section} 节 ${phrase(3)}`, "");
    for (let paragraph = 0; paragraph < 2; paragraph++) {
      lines.push(phrase(18 + Math.floor(next() * 20)), "");
    }
    for (let item = 0; item < 4; item++) {
      lines.push(`${next() < 0.4 ? "- [ ] " : "- "}${phrase(6)}`);
    }
    lines.push("");
    const kind = section % 4;
    if (kind === 0) {
      lines.push(
        "```js",
        ...Array.from(
          { length: 5 },
          (_, i) => `const v${i} = "${pick(words)}";`,
        ),
        "```",
        "",
      );
    } else if (kind === 1) {
      lines.push(
        "| 名称 | 状态 |",
        "| --- | --- |",
        ...Array.from(
          { length: 3 },
          () => `| ${pick(words)} | ${pick(words)} |`,
        ),
        "",
      );
    } else if (kind === 2) {
      lines.push(`> ${phrase(12)}`, "");
    } else {
      lines.push("$$", "\\sum_{i=1}^{n} x_i", "$$", "");
    }
  }
  return lines.join("\n");
}

async function openNote(app: CrossnoteApp, text: string) {
  await app.open();
  await app.openNotes();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  // R3_MODE="Source code" types with the markup shown, to tell what the
  // edit mode's drawing costs from what the rest of the app costs.
  await app
    .modeButton((process.env.R3_MODE as "Source code") ?? "Edit")
    .click();
  await expect(app.editor).toBeVisible();
}

const typed = "the quick brown fox jumps over the lazy dog ".repeat(3);

for (const { name, sections } of [
  { name: "medium", sections: 40 },
  { name: "long", sections: 150 },
  { name: "very long", sections: 600 },
]) {
  for (const where of ["middle", "end"] as const) {
    test(`latency: typing in the ${where} of a ${name} note`, async ({
      app,
      page,
    }) => {
      test.setTimeout(180_000);
      const text = longNote(sections);
      const lineCount = text.split("\n").length;
      await openNote(app, text);
      // The paragraph line nearest the place, so that what is typed lands
      // in prose in every run.
      const lines = text.split("\n");
      let line = where === "middle" ? Math.floor(lineCount / 2) : lineCount - 1;
      while (line > 0 && !/^[^#\-|>`$\s]/.test(lines[line])) {
        line--;
      }
      await app.editor.evaluate(
        (element, at) => {
          const editor = (element as EditorHost).editorHandle;
          editor.focus();
          editor.select(at);
        },
        { line, ch: lines[line].length },
      );
      await page.waitForTimeout(1000);
      await page.keyboard.type("warm up ", { delay: 60 });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const kept = {
          latency: [] as number[],
          events: [] as { name: string; duration: number; id: number }[],
        };
        (window as unknown as { kept: typeof kept }).kept = kept;
        document.addEventListener(
          "keydown",
          (event) => {
            const start = event.timeStamp;
            requestAnimationFrame(() => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () =>
                kept.latency.push(performance.now() - start);
              channel.port2.postMessage(0);
            });
          },
          true,
        );
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceEventTiming[]) {
            kept.events.push({
              name: entry.name,
              duration: entry.duration,
              id: entry.interactionId ?? 0,
            });
          }
        }).observe({
          type: "event",
          durationThreshold: 16,
        } as PerformanceObserverInit);
      });
      await page.keyboard.type(typed, { delay: 60 });
      await page.waitForTimeout(1000);
      const kept = await page.evaluate(
        () =>
          (
            window as unknown as {
              kept: {
                latency: number[];
                events: { name: string; duration: number; id: number }[];
              };
            }
          ).kept,
      );
      expect(await app.editorText()).toContain(`warm up ${typed}`);
      const sorted = [...kept.latency].sort((a, b) => a - b);
      const quantile = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      // The longest entry of each interaction (keydown, keypress, input...).
      const byInteraction = new Map<number, number>();
      for (const event of kept.events) {
        if (event.id) {
          byInteraction.set(
            event.id,
            Math.max(byInteraction.get(event.id) ?? 0, event.duration),
          );
        }
      }
      const interactions = [...byInteraction.values()];
      test.info().annotations.push({
        type: "latency",
        description: JSON.stringify({
          note: { sections, lines: lineCount, chars: text.length },
          keys: sorted.length,
          p50: Number(quantile(0.5).toFixed(1)),
          p95: Number(quantile(0.95).toFixed(1)),
          max: Number(sorted[sorted.length - 1].toFixed(1)),
          eventTiming: {
            interactionsOver16: interactions.length,
            over50: interactions.filter((d) => d >= 50).length,
            max: interactions.length ? Math.max(...interactions) : 0,
          },
        }),
      });
    });
  }
}
