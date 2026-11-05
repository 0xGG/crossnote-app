import { readFileSync } from "node:fs";
import { appPolicy, headersFile } from "../site-headers";
import { expect, test } from "./fixtures";

// The policy comes with the page's response, from site-headers.ts, which
// also writes the _headers file the deployed site is served by; the page
// holds none of its own.
test("sends the page's policy as a header, as the deployed site does", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toBe(appPolicy);
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy" i]'),
  ).toHaveCount(0);
  expect(
    readFileSync(new URL("../dist/_headers", import.meta.url), "utf-8"),
  ).toBe(headersFile());
});

// What the page's Content-Security-Policy holds the page to, whatever ends
// up in it: no base address on another site, and no plugin content.
test("refuses a base address elsewhere and plugin content", async ({
  app,
  page,
}) => {
  await app.open();
  const baseURI = await page.evaluate(() => {
    const violations: string[] = [];
    (window as any).violations = violations;
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
    return baseURI;
  });
  expect(new URL(baseURI).origin).toBe(new URL(page.url()).origin);
  // The object's violation is reported once it tries to load.
  await expect
    .poll(() => page.evaluate(() => (window as any).violations))
    .toEqual(expect.arrayContaining(["base-uri", "object-src"]));
});
