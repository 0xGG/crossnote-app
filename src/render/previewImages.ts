const asciiSpace = /[\t\n\f\r ]/;

function isHttp(url: string): boolean {
  // A secure base keeps relative notebook paths distinct from explicit
  // HTTP addresses and lets the browser normalize the scheme itself.
  try {
    return new URL(url, "https://notebook.invalid/").protocol === "http:";
  } catch {
    return false;
  }
}

// A srcset URL ends at ASCII whitespace. Commas inside a URL (including
// data URLs) are content; trailing commas or commas after descriptors
// separate candidates. Preserve the browser's descriptors verbatim.
function filterSrcset(value: string): string {
  const kept: string[] = [];
  let pos = 0;
  while (pos < value.length) {
    while (
      pos < value.length &&
      (value[pos] === "," || asciiSpace.test(value[pos]))
    )
      pos++;
    if (pos === value.length) break;
    const start = pos;
    while (pos < value.length && !asciiSpace.test(value[pos])) pos++;
    const url = value.slice(start, pos);
    if (url.endsWith(",")) {
      if (!isHttp(url)) kept.push(url.replace(/,+$/, ""));
      continue;
    }
    let inParens = false;
    while (pos < value.length) {
      const ch = value[pos];
      if (!inParens && ch === ",") break;
      if (ch === "(") inParens = true;
      if (ch === ")") inParens = false;
      pos++;
    }
    if (!isHttp(url))
      kept.push(value.slice(start, pos).replace(/[\t\n\f\r ]+$/, ""));
  }
  return kept.join(", ");
}

export function filterPreviewImages(content: DocumentFragment) {
  for (const image of content.querySelectorAll("img[src]")) {
    if (isHttp(image.getAttribute("src")!)) image.setAttribute("src", "");
  }
  for (const source of content.querySelectorAll(
    "img[srcset], picture source[srcset]",
  )) {
    const safe = filterSrcset(source.getAttribute("srcset")!);
    if (safe) source.setAttribute("srcset", safe);
    else source.removeAttribute("srcset");
  }
}
