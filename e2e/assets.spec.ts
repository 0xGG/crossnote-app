import { expect, test } from "./fixtures";

test("draws a UI icon from a decodable same-origin emoji sheet", async ({
  app,
  page,
}) => {
  await app.open();
  const icon = page.locator("img.emoji").first();
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("alt", /\S/);
  const sheet = await icon.evaluate(async (element) => {
    const background = getComputedStyle(element).backgroundImage;
    const match = background.match(/^url\(["']?(.*?)["']?\)$/);
    if (!match) throw new Error(`No emoji background: ${background}`);
    const url = new URL(match[1], document.baseURI);
    const image = new Image();
    image.src = url.href;
    await image.decode();
    return {
      origin: url.origin,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  });
  expect(sheet).toEqual({
    origin: new URL(page.url()).origin,
    width: 4092,
    height: 4092,
  });
});
