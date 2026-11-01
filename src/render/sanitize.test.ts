import { describe, expect, it } from "vitest";
import { isSafeAddress, sanitizeHTML } from "./sanitize";

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
      '<h1 id="cookie">Cookie</h1><a name="anchor"></a><img name="getElementById" src="a.png">',
    );
    expect(element.querySelector("h1").id).toBe("cookie");
    expect(element.querySelector("a").getAttribute("name")).toBe("anchor");
    expect(element.querySelector("img").hasAttribute("name")).toBe(false);
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
