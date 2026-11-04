import { describe, expect, it } from "vitest";
import { isSafeAddress, sanitizeHTML, sanitizeSVG } from "./sanitize";

const render = (html: string) => {
  const element = document.createElement("div");
  element.innerHTML = sanitizeHTML(html);
  return element;
};

describe("sanitizeHTML", () => {
  it("drops scripts, handlers and script addresses but keeps the text", () => {
    const element = render(
      '<p>before<script>alert(1)</script><img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)">link</a>after</p>',
    );
    expect(element.querySelector("script")).toBeNull();
    expect(element.querySelector("img").getAttribute("src")).toBe("x.png");
    expect(element.querySelector("img").hasAttribute("onerror")).toBe(false);
    expect(element.querySelector("a").hasAttribute("href")).toBe(false);
    expect(element.textContent).toBe("beforelinkafter");
  });

  it.each([
    ["style", "<style>p { color: red }</style>"],
    ["iframe", '<iframe src="https://example.com"></iframe>'],
    ["object", '<object data="x.swf"></object>'],
    ["embed", '<embed src="x.swf">'],
    ["form", '<form action="https://example.com"><input name="q"></form>'],
    ["button", '<button formaction="javascript:alert(1)">go</button>'],
  ])("drops %s elements", (tag, html) => {
    expect(render(`<p>${html}</p>`).querySelector(tag)).toBeNull();
  });

  it("keeps what the preview, the widgets and the slides read", () => {
    const element = render(
      [
        '<h2 data-line="3" id="title" class="mume-header">Title</h2>',
        '<p style="color: red"><kbd>Ctrl</kbd> <span class="echomd-widget" data-widget-name="timer" data-widget-attributes="{&quot;date&quot;:1}"></span></p>',
        '<ul><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" data-line="5"> task</li></ul>',
        "<details><summary>More</summary>hidden</details>",
        '<pre class="vickeymd-fence" data-parsed-info="{&quot;language&quot;:&quot;js&quot;}">let a</pre>',
        '<section data-background-image="images/back.png" data-background-color="#000"></section>',
      ].join(""),
    );
    expect(element.querySelector("h2").outerHTML).toBe(
      '<h2 data-line="3" id="title" class="mume-header">Title</h2>',
    );
    expect(element.querySelector("p").getAttribute("style")).toBe("color: red");
    expect(element.querySelector("kbd")).not.toBeNull();
    expect(
      element
        .querySelector(".echomd-widget")
        .getAttribute("data-widget-attributes"),
    ).toBe('{"date":1}');
    expect(element.querySelector("input").getAttribute("type")).toBe(
      "checkbox",
    );
    expect(element.querySelector("details summary").textContent).toBe("More");
    expect(element.querySelector("pre").getAttribute("data-parsed-info")).toBe(
      '{"language":"js"}',
    );
    const section = element.querySelector("section");
    expect(section.getAttribute("data-background-image")).toBe(
      "images/back.png",
    );
    expect(section.getAttribute("data-background-color")).toBe("#000");
  });

  it("keeps a heading's id that names a property of document, not such a name", () => {
    const element = render(
      '<h1 id="cookie">Cookie</h1><a name="anchor"></a><a name="cookie"></a><img name="getElementById" src="a.png">',
    );
    expect(element.querySelector("h1").id).toBe("cookie");
    const [anchor, cookie] = Array.from(element.querySelectorAll("a"));
    expect(anchor.getAttribute("name")).toBe("anchor");
    expect(cookie.hasAttribute("name")).toBe(false);
    expect(element.querySelector("img").hasAttribute("name")).toBe(false);
  });

  it("drops any name on an image, which would make its id a property of document", () => {
    const image = render(
      '<img id="getElementById" name="x" src="a.png">',
    ).querySelector("img");
    expect(image.id).toBe("getElementById");
    expect(image.hasAttribute("name")).toBe(false);
  });

  it("keeps a wavedrom block's source as text, and drops scripts of any type", () => {
    const element = render(
      '<div class="vickeymd-fence wavedrom">{ "signal": [] }</div><script type="WaveDrom">window.x = 1</script><script type="text/javascript">alert(1)</script>',
    );
    expect(element.querySelector("script")).toBeNull();
    expect(element.textContent).toBe('{ "signal": [] }');
  });

  it("drops a slide background that would load a script address", () => {
    const section = render(
      '<section data-background-iframe="javascript:alert(1)" data-background-image="https://example.com/a.png"></section>',
    ).querySelector("section");
    expect(section.hasAttribute("data-background-iframe")).toBe(false);
    expect(section.getAttribute("data-background-image")).toBe(
      "https://example.com/a.png",
    );
  });

  it("drops a media address reveal.js would write into HTML with quotes in it", () => {
    const [video, color] = Array.from(
      render(
        `<section data-background-video='https://a.invalid/x.mp4" onerror="alert(1)'></section><section data-background="#000"></section>`,
      ).querySelectorAll("section"),
    );
    expect(video.hasAttribute("data-background-video")).toBe(false);
    expect(color.getAttribute("data-background")).toBe("#000");
  });

  it("drops what reveal.js would write into HTML as it is", () => {
    const section = render(
      '<section data-notes="<img src=x onerror=alert(1)>"><a href="https://example.com/" data-preview-link>link</a><aside class="notes"><b>Said</b></aside></section>',
    ).querySelector("section");
    expect(section.hasAttribute("data-notes")).toBe(false);
    expect(section.querySelector("a").hasAttribute("data-preview-link")).toBe(
      false,
    );
    expect(section.querySelector("aside.notes").innerHTML).toBe("<b>Said</b>");
  });

  it("keeps the TeX KaTeX puts beside its MathML apart from the formula", () => {
    const math = render(
      '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span></span>',
    ).querySelector("math");
    expect(math.querySelector("semantics > mrow").textContent).toBe("x2");
    const annotation = math.querySelector("semantics > annotation");
    expect(annotation.getAttribute("encoding")).toBe("application/x-tex");
    expect(annotation.textContent).toBe("x^2");
  });

  it("drops HTML that MathML would carry", () => {
    const element = render(
      '<math><semantics><annotation-xml encoding="text/html"><img src="x.png" onerror="alert(1)"></annotation-xml></semantics></math>',
    );
    expect(element.querySelector("annotation-xml")).toBeNull();
    expect(element.querySelector("img[onerror]")).toBeNull();
  });
});

describe("isSafeAddress", () => {
  it.each([
    "https://example.com/a.png",
    "http://example.com",
    "images/a.png",
    "./a.png",
    "/a.png",
    "#top",
    "//example.com/a.png",
  ])("accepts %s", (address) => {
    expect(isSafeAddress(address)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ])("refuses %s", (address) => {
    expect(isSafeAddress(address)).toBe(false);
  });
});

describe("sanitizeSVG", () => {
  const draw = (svg: string) => {
    const element = document.createElement("div");
    element.innerHTML = sanitizeSVG(svg);
    return element;
  };

  it("keeps a shape repeated from the drawing, not one fetched from elsewhere", () => {
    const element = draw(
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="wave" d="M0 0"/></defs>' +
        '<use xlink:href="#wave"/><use href="#wave"/>' +
        '<use xlink:href="https://example.org/a.svg#x"/><use href="data:image/svg+xml,&lt;svg/&gt;#x"/></svg>',
    );
    const uses = Array.from(element.querySelectorAll("use"));
    expect(
      uses.map(
        (use) => use.getAttribute("xlink:href") ?? use.getAttribute("href"),
      ),
    ).toEqual(["#wave", "#wave", null, null]);
  });

  it("keeps the drawing's own style sheet, not one a label brings", () => {
    const element = draw(
      "<svg><style>#d text{fill:red}</style><g><style>body{display:none}</style></g><foreignObject><div><style>.App{display:none}</style>label</div></foreignObject></svg>",
    );
    expect(
      Array.from(
        element.querySelectorAll("style"),
        (style) => style.textContent,
      ),
    ).toEqual(["#d text{fill:red}"]);
    expect(element.textContent).toContain("label");
  });

  it("keeps out what a note's HTML may not have either", () => {
    const element = draw(
      '<svg><foreignObject><div><form action="https://example.org/"><input type="password"><select></select><textarea></textarea><button>x</button></form><iframe src="x"></iframe>label</div></foreignObject></svg>',
    );
    expect(
      element.querySelector("form, input, select, textarea, button, iframe"),
    ).toBeNull();
    // Their text stays, as text.
    expect(element.textContent).toBe("xlabel");
  });

  it("keeps HTML labels and a diagram's style, without what would run", () => {
    const element = draw(
      '<svg onload="alert(1)"><style>#d .node{fill:red}</style><foreignObject><div><img src="x" onerror="alert(1)">label</div></foreignObject><script>alert(1)</script></svg>',
    );
    expect(element.querySelector("svg").hasAttribute("onload")).toBe(false);
    expect(element.querySelector("style").textContent).toBe(
      "#d .node{fill:red}",
    );
    expect(element.querySelector("foreignObject div").textContent).toBe(
      "label",
    );
    expect(element.querySelector("img").hasAttribute("onerror")).toBe(false);
    expect(element.querySelector("script")).toBeNull();
  });
});
