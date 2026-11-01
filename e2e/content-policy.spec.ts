import { expect, test } from "./fixtures";

// What the page's Content-Security-Policy (index.html) holds the page to,
// whatever ends up in it: no base address on another site, and no plugin
// content.
test("refuses a base address elsewhere and plugin content", async ({
  app,
  page,
}) => {
  await app.open();
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      violations.push(event.effectiveDirective),
    );
    const base = document.createElement("base");
    base.href = "https://example.org/";
    document.head.appendChild(base);
    const baseURI = document.baseURI;
    base.remove();
    const object = document.createElement("object");
    object.data = "/favicon.ico";
    document.body.appendChild(object);
    await new Promise((resolve) => setTimeout(resolve, 500));
    object.remove();
    return { baseURI, violations };
  });
  expect(new URL(result.baseURI).origin).toBe(new URL(page.url()).origin);
  expect(result.violations).toEqual(
    expect.arrayContaining(["base-uri", "object-src"]),
  );
});
