import { describe, expect, it } from "vitest";
import { renderWaveDrom } from "./wavedrom";

const light = { dark: false };

/**
 * Sources that have wavedrom write markup of their own into its drawing:
 * JsonML in the head's text (an image with onerror, an animation with
 * onbegin), XHTML in a lane's name, an attribute value a quote ends early,
 * and an edge's label.
 */
export const wavedromPayloads = [
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: ["tspan", ["image", { href: "x.png", onerror: "window.wd1=1" }]],
    },
  },
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: [
        "tspan",
        ["set", { attributeName: "x", to: "1", onbegin: "window.wd2=1" }],
      ],
    },
  },
  {
    signal: [
      {
        name: "<img xmlns='http://www.w3.org/1999/xhtml' src='x.png' onerror='window.wd3=1'/>",
        wave: "01",
      },
    ],
  },
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: [
        "tspan",
        {
          class:
            'x"><image href="x.png" onerror="window.wd4=1"/><tspan class="y',
        },
        "t",
      ],
    },
  },
  {
    signal: [
      { name: "a", wave: "01", node: ".a" },
      { name: "b", wave: "01", node: ".b" },
    ],
    edge: ["a~b <image href='x.png' onerror='window.wd5=1'/>"],
  },
];

describe("renderWaveDrom", () => {
  it("draws a diagram from its source as SVG", async () => {
    const drawing = renderWaveDrom(
      '{"signal": [{"name": "clk", "wave": "p..."}]}',
      {},
      light,
    );
    await drawing.done;
    const svg = drawing.element.querySelector("svg");
    expect(svg.classList.contains("WaveDrom")).toBe(true);
    expect(svg.textContent).toContain("clk");
    // The wave is drawn with the skin's shapes, which use elements repeat.
    const uses = Array.from(svg.querySelectorAll("use"));
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(use.getAttribute("xlink:href")).toMatch(/^#/);
      expect(
        svg.querySelector(`[id="${use.getAttribute("xlink:href").slice(1)}"]`),
      ).not.toBeNull();
    }
  });

  it("draws on the page's own colour in a dark preview", async () => {
    const backgrounds = async (dark: boolean) => {
      const drawing = renderWaveDrom(
        '{"signal": [{"name": "clk", "wave": "p."}]}',
        {},
        { dark },
      );
      await drawing.done;
      return Array.from(drawing.element.querySelectorAll("rect"))
        .map((rect) => rect.getAttribute("style"))
        .filter((style) => style?.includes("stroke:none"));
    };
    expect(await backgrounds(false)).toEqual(["stroke:none;fill:white"]);
    expect(await backgrounds(true)).toEqual(["stroke:none;fill:none"]);
  });

  it("puts nothing in the page that runs, whatever the source writes", async () => {
    for (const payload of wavedromPayloads) {
      const drawing = renderWaveDrom(JSON.stringify(payload), {}, light);
      await drawing.done;
      expect(drawing.element.querySelector("svg")).not.toBeNull();
      const handlers = Array.from(
        drawing.element.querySelectorAll("*"),
      ).flatMap((element) =>
        element.getAttributeNames().filter((name) => /^on/i.test(name)),
      );
      expect(handlers).toEqual([]);
      expect(
        drawing.element.querySelector("script, img, foreignObject"),
      ).toBeNull();
    }
  });

  it("draws in the dark skin in a dark preview, unless the source names a skin", async () => {
    const source = { signal: [{ name: "clk", wave: "p." }] };
    const styles = async (code: string, dark: boolean) => {
      const drawing = renderWaveDrom(code, {}, { dark });
      await drawing.done;
      return drawing.element.querySelector("style")?.textContent;
    };
    const lightStyle = await styles(JSON.stringify(source), false);
    const darkStyle = await styles(JSON.stringify(source), true);
    expect(darkStyle).not.toBe(lightStyle);
    expect(
      await styles(
        JSON.stringify({ ...source, config: { skin: "default" } }),
        true,
      ),
    ).toBe(lightStyle);
  });

  it("writes what the source names and labels as text, and keeps only the skin's style", async () => {
    const drawing = renderWaveDrom(
      JSON.stringify({
        signal: [
          {
            name: '</text></g></svg><style>body{display:none}</style><form><input name="p"><button>x</button></form>',
            wave: "01",
          },
        ],
        head: { text: ["tspan", ["style", "body{display:none}"], "head"] },
      }),
      {},
      light,
    );
    await drawing.done;
    const element = drawing.element;
    expect(element.querySelectorAll("svg")).toHaveLength(1);
    expect(element.querySelector("form, input, button")).toBeNull();
    const styles = Array.from(element.querySelectorAll("style"));
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).not.toContain("display:none");
  });

  it("shows names and labels as written, with the characters markup uses", async () => {
    const written = 'a<b & "c" &amp; d>';
    const drawing = renderWaveDrom(
      JSON.stringify({
        signal: [{ name: written, wave: "x3", data: [written] }],
        head: { text: written },
      }),
      {},
      light,
    );
    await drawing.done;
    const texts = Array.from(
      drawing.element.querySelectorAll("text"),
      (text) => text.textContent,
    );
    expect(texts.filter((text) => text === written)).toHaveLength(3);
  });

  it("draws in the default skin when the config names something no skin is", async () => {
    for (const skin of ["constructor", "__proto__", "toString"]) {
      const drawing = renderWaveDrom(
        JSON.stringify({
          signal: [{ name: "clk", wave: "p." }],
          config: { skin },
        }),
        {},
        light,
      );
      await drawing.done;
      expect(drawing.element.querySelector(".language-error")).toBeNull();
      expect(drawing.element.querySelector("svg use")).not.toBeNull();
    }
  });

  it("draws nothing for a drawing disposed of while wavedrom loads", async () => {
    const drawing = renderWaveDrom(
      '{"signal": [{"name": "clk", "wave": "p."}]}',
      {},
      light,
    );
    await Promise.resolve();
    drawing.dispose();
    await drawing.done;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(drawing.element.childNodes.length).toBe(0);
  });

  it("shows why a source that is not JSON is not drawn", async () => {
    const drawing = renderWaveDrom("{ signal: [] }", {}, light);
    await drawing.done;
    expect(drawing.element.querySelector(".language-error")).not.toBeNull();
  });
});
