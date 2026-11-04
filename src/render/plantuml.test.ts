import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alwaysDrawPlantUMLKey,
  encodePlantUML,
  plantUMLServer,
  renderPlantUML,
} from "./plantuml";

const context = { dark: false, inSlides: false };

// PlantUML's base64 back to bytes, then inflated: what the server reads.
async function decode(text: string): Promise<string> {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const [c1, c2, c3, c4] = Array.from(text.slice(i, i + 4), (c) =>
      alphabet.indexOf(c),
    );
    bytes.push(
      (c1 << 2) | (c2 >> 4),
      ((c2 & 0xf) << 4) | (c3 >> 2),
      ((c3 & 0x3) << 6) | c4,
    );
  }
  // The last group of four can end in up to two bytes of padding, which the
  // server's inflater reads past and this one refuses.
  for (const padding of [0, 1, 2]) {
    const inflated = new Blob([
      new Uint8Array(bytes.slice(0, bytes.length - padding)),
    ])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    try {
      return await new Response(inflated).text();
    } catch {
      // One byte fewer.
    }
  }
  throw new Error(`not PlantUML's encoding: ${text}`);
}

afterEach(() => {
  localStorage.removeItem(alwaysDrawPlantUMLKey);
});

describe("encodePlantUML", () => {
  it("is read back as PlantUML writes it", async () => {
    // The example on plantuml.com's text encoding page.
    expect(await decode("SyfFKj2rKt3CoKnELR1Io4ZDoSa70000")).toBe(
      "Bob -> Alice : hello",
    );
  });

  it("writes the source as the server reads it, whatever its characters", async () => {
    const source = "@startuml\nAlice -> Bob: 你好, «Bob»\n@enduml";
    const encoded = await encodePlantUML(source);
    expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/);
    expect(await decode(encoded)).toBe(source);
  });
});

describe("renderPlantUML", () => {
  it("shows the source and asks before sending it to plantuml.com", async () => {
    const drawing = renderPlantUML("A -> B", {}, context);
    await drawing.done;
    expect(drawing.element.querySelector("img")).toBeNull();
    expect(drawing.element.querySelector("pre").textContent).toBe("A -> B");
    const button = drawing.element.querySelector("button");
    expect(button.textContent).toBe(
      "Draw with plantuml.com (sends the diagram's source to it)",
    );
    button.click();
    await vi.waitFor(() =>
      expect(drawing.element.querySelector("img")).not.toBeNull(),
    );
    const image = drawing.element.querySelector("img");
    expect(image.src.startsWith(plantUMLServer)).toBe(true);
    expect(await decode(image.src.slice(plantUMLServer.length))).toBe("A -> B");
    expect(drawing.element.querySelector("button")).toBeNull();
  });

  it("sends nothing for a block disposed of before its button is pressed", async () => {
    const drawing = renderPlantUML("A -> B", {}, context);
    await drawing.done;
    const button = drawing.element.querySelector("button");
    drawing.dispose();
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(drawing.element.querySelector("img")).toBeNull();
  });

  it("draws without asking when the setting says so", async () => {
    localStorage.setItem(alwaysDrawPlantUMLKey, "true");
    const drawing = renderPlantUML("A -> B", {}, context);
    await drawing.done;
    expect(drawing.element.querySelector("button")).toBeNull();
    expect(
      drawing.element.querySelector("img").src.startsWith(plantUMLServer),
    ).toBe(true);
  });
});
