// Attributes written in braces, as a heading, a code block's info string
// or a slide comment gives them: {#id .class1 .class2 key=value flag}.

export type AttributeValue = string | number | boolean | AttributeValue[];
export type Attributes = { [key: string]: AttributeValue };

type Node = [value: AttributeValue, end: number, isWord: boolean];

const wordChar = /^[^,;=\s]$/;

function extractQuotedString(text: string, start: number): Node | undefined {
  const quote = text[start];
  if (!"'\"`".includes(quote)) {
    return undefined;
  }
  let end = start + 1;
  const chars: string[] = [];
  while (end < text.length) {
    if (text[end] === "\\") {
      if (end + 1 < text.length) {
        chars.push(text[end + 1]);
      }
      end += 2;
      continue;
    }
    if (text[end] === quote) {
      end += 1;
      break;
    }
    chars.push(text[end]);
    end += 1;
  }
  return [chars.join(""), end, false];
}

function extractWord(text: string, start: number): Node | undefined {
  let i = start;
  let bracketDepth = 0;
  while (i < text.length) {
    const char = text[i];
    if (!wordChar.test(char)) {
      break;
    }
    if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth -= 1;
    }
    if (bracketDepth < 0) {
      break;
    }
    i += 1;
  }
  if (i === start) {
    return undefined;
  }
  return [text.substring(start, i), i, true];
}

function extractValue(value: string): AttributeValue {
  if (value.toLowerCase() === "true") {
    return true;
  } else if (value.toLowerCase() === "false") {
    return false;
  } else if (!isNaN(value as any)) {
    return parseFloat(value);
  }
  return value;
}

function extractArray(text: string, start: number): Node | undefined {
  if (text[start] !== "[") {
    return undefined;
  }
  const result: AttributeValue[] = [];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "]") {
      i += 1;
      break;
    }
    const node =
      extractArray(text, i) ||
      extractQuotedString(text, i) ||
      extractWord(text, i);
    if (node) {
      const [rawValue, end, isWord] = node;
      result.push(isWord ? extractValue(rawValue as string) : rawValue);
      i = end;
    } else {
      i += 1;
    }
  }
  return [result, i, false];
}

export function parseAttributes(text: string): Attributes {
  let textToParse = (text || "").trim();
  if (textToParse[0] === "{" && textToParse[textToParse.length - 1] === "}") {
    textToParse = textToParse.slice(1, -1);
  }
  const output: Attributes = {};
  let pendingKey: string | undefined;
  let i = 0;
  while (i < textToParse.length) {
    const node =
      extractArray(textToParse, i) ||
      extractQuotedString(textToParse, i) ||
      extractWord(textToParse, i);
    if (!node) {
      i += 1;
      continue;
    }
    const keyIsPending = typeof pendingKey === "string";
    const [rawValue, end, isWord] = node;
    const value =
      isWord && keyIsPending ? extractValue(rawValue as string) : rawValue;
    i = end;
    if (keyIsPending) {
      output[pendingKey as string] = value;
      pendingKey = undefined;
    } else if (textToParse[i] === "=") {
      pendingKey = value as string;
    } else {
      const firstChar = (value as string)[0];
      const special =
        firstChar === "." ? "class" : firstChar === "#" ? "id" : undefined;
      if (special) {
        const specialValue = (value as string).substring(1);
        if (specialValue.length) {
          const previousValue = output[special];
          output[special] =
            typeof previousValue === "undefined"
              ? specialValue
              : previousValue + " " + specialValue;
        }
      } else if (typeof value === "string") {
        output[value] = true;
      }
    }
  }
  return output;
}

function stringifyArray(value: AttributeValue[]): string {
  return (
    "[" +
    value
      .map((v) => (v instanceof Array ? stringifyArray(v) : JSON.stringify(v)))
      .join(", ") +
    "]"
  );
}

// key=value pairs, each value as JSON, separated by spaces.
export function stringifyAttributes(attributes: Attributes): string {
  const parts: string[] = [];
  for (const key in attributes) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      const value = attributes[key];
      parts.push(
        key +
          "=" +
          (value instanceof Array
            ? stringifyArray(value)
            : JSON.stringify(value)),
      );
    }
  }
  return parts.join(" ");
}
