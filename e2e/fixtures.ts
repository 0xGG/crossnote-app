import { test as base, expect } from "@playwright/test";
import { CrossnoteApp } from "./crossnote";

type Fixtures = {
  app: CrossnoteApp;
  firstRun: boolean;
};

export const test = base.extend<Fixtures>({
  // On a fresh origin the app asks for a language before anything else.
  // Exactly one spec is about that dialog; the others seed the choice before
  // any page script runs so they start where a returning user does.
  firstRun: [false, { option: true }],
  page: async ({ page, firstRun }, use) => {
    if (!firstRun) {
      await page.addInitScript(() => {
        window.localStorage.setItem("settings/language", "en-US");
      });
    }
    await use(page);
  },
  app: async ({ page }, use) => {
    await use(new CrossnoteApp(page));
  },
});

export { expect };
