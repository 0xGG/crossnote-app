import emojiMetadata from "emoji-datasource-twitter/emoji.json" with { type: "json" };

interface SheetEmoji {
  unified: string;
  non_qualified: string | null;
  sheet_x: number;
  sheet_y: number;
  has_img_twitter: boolean;
  skin_variations?: Record<string, SheetEmoji>;
}

// Twemoji retains variation selectors in ZWJ sequences, but removes them
// elsewhere before supplying the code point key to its callback.
function twemojiKey(unified: string): string {
  const codePoints = unified.toLowerCase().split("-");
  return (
    codePoints.includes("200d")
      ? codePoints
      : codePoints.filter((codePoint) => codePoint !== "fe0f")
  )
    .map((codePoint) => parseInt(codePoint, 16).toString(16))
    .join("-");
}

/** Coordinates in emoji-datasource-twitter 16.0.0's 62-column sprite sheet.
 * Each number encodes x * 62 + y; decode with floor(n / 62) and n % 62.
 */
export function emojiSheetCells(): Record<string, number> {
  const cells: Record<string, number> = {};
  const add = (emoji: SheetEmoji) => {
    if (!emoji.has_img_twitter) return;
    const cell = emoji.sheet_x * 62 + emoji.sheet_y;
    for (const sequence of [emoji.unified, emoji.non_qualified]) {
      if (!sequence) continue;
      const key = twemojiKey(sequence);
      if (cells[key] !== undefined && cells[key] !== cell) {
        throw new Error(`Conflicting emoji sheet coordinates for ${key}`);
      }
      cells[key] = cell;
    }
  };

  for (const emoji of emojiMetadata as SheetEmoji[]) {
    add(emoji);
    for (const variation of Object.values(emoji.skin_variations ?? {})) {
      add(variation);
    }
  }
  return cells;
}
