import { Attributes, parseAttributes } from "./attributes";

// What a code block's info string says: its language and the attributes in
// braces after it (```js {cmd=true}), or after a space (```js cmd=true).
export interface BlockInfo {
  language?: string;
  attributes?: Attributes;
}

export function parseBlockInfo(raw: string): BlockInfo {
  let language: string | undefined;
  let attributesAsString: string;
  let attributes: Attributes | undefined;
  const trimmedParams = raw.trim();
  const match =
    trimmedParams.indexOf("{") !== -1
      ? trimmedParams.match(/^([^\s{]*)\s*\{(.*?)\}/)
      : trimmedParams.match(/^([^\s]+)\s+(.+?)$/);
  if (match) {
    if (match[1].length) {
      language = match[1];
    }
    attributesAsString = match[2];
  } else {
    language = trimmedParams;
    attributesAsString = "";
  }
  if (attributesAsString) {
    try {
      attributes = parseAttributes(attributesAsString);
    } catch {
      // Left without attributes.
    }
  } else {
    attributes = {};
  }
  return { language, attributes };
}

// The same, with the language trimmed and in lower case ("" when there is
// none), and attributes ({} when they could not be read).
export function normalizeBlockInfo(blockInfo: BlockInfo): BlockInfo {
  const language =
    typeof blockInfo.language === "string"
      ? blockInfo.language.trim().toLowerCase()
      : "";
  const attributes =
    typeof blockInfo.attributes === "object" ? blockInfo.attributes : {};
  if (language !== blockInfo.language || attributes !== blockInfo.attributes) {
    return { language, attributes };
  }
  return blockInfo;
}
