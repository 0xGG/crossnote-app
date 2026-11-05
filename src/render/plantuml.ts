import i18n from "../i18n/i18n";
import { failedBlock, Renderer, startDrawing } from "./drawing";

/** Where the setting to draw PlantUML diagrams without asking is kept. */
export const alwaysDrawPlantUMLKey = "settings/alwaysDrawPlantUML";

export function alwaysDrawPlantUML(): boolean {
  try {
    return localStorage.getItem(alwaysDrawPlantUMLKey) === "true";
  } catch {
    return false;
  }
}

// PlantUML's own base64 alphabet: digits, upper case, lower case, - and _.
const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function encode64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [b1, b2 = 0, b3 = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    text +=
      alphabet[b1 >> 2] +
      alphabet[((b1 & 0x3) << 4) | (b2 >> 4)] +
      alphabet[((b2 & 0xf) << 2) | (b3 >> 6)] +
      alphabet[b3 & 0x3f];
  }
  return text;
}

/**
 * A diagram's source as the PlantUML server reads it in an address: UTF-8,
 * deflated, in PlantUML's base64.
 */
export async function encodePlantUML(source: string): Promise<string> {
  const deflated = new Blob([source])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return encode64(new Uint8Array(await new Response(deflated).arrayBuffer()));
}

export const plantUMLServer = "https://www.plantuml.com/plantuml/img/";

/**
 * A PlantUML diagram, drawn by the PlantUML server: an image whose address
 * holds the diagram's source. As that sends the source to plantuml.com, the
 * block shows the source and a button to draw it, unless the setting to
 * draw such diagrams without asking is on; an image that cannot be loaded
 * gives way to the source and the button again. Done once the image, or the
 * source, is in its place: the image loads as images do, and is not waited
 * for, as a slow server would otherwise have it given up on.
 */
export const renderPlantUML: Renderer = (code) => {
  const element = document.createElement("div");
  element.classList.add("plantuml");
  return startDrawing(element, async (signal) => {
    const source = document.createElement("pre");
    source.classList.add("language-text");
    source.textContent = code;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = i18n.t("preview/draw-plantuml");
    const ask = () => {
      button.disabled = false;
      element.replaceChildren(source, button);
    };
    const draw = async () => {
      const address = plantUMLServer + (await encodePlantUML(code));
      if (!signal.aborted) {
        const image = document.createElement("img");
        image.alt = i18n.t("preview/plantuml-diagram");
        image.addEventListener("error", () => {
          if (!signal.aborted) {
            ask();
          }
        });
        image.src = address;
        element.replaceChildren(image);
      }
    };
    button.onclick = () => {
      button.disabled = true;
      draw().catch((error) => element.replaceChildren(failedBlock(error)));
    };
    if (alwaysDrawPlantUML()) {
      await draw();
    } else {
      ask();
    }
  });
};
