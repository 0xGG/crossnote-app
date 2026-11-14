import { test as base, expect } from "@playwright/test";
import { CrossnoteApp } from "./crossnote";

type Fixtures = {
  app: CrossnoteApp;
  firstRun: boolean;
  notesOpenIn: "Preview" | null;
  expectPolicyViolations: string[];
  policyViolations: string[];
};

export const test = base.extend<Fixtures>({
  // On a fresh origin the app asks for a language before anything else.
  // Exactly one spec is about that dialog; the others seed the choice before
  // any page script runs so they start where a returning user does.
  firstRun: [false, { option: true }],
  // The mode a note opens in is a setting, the editor unless it is changed.
  // The specs open notes in the preview, as someone who chose that in the
  // settings does: most of them are about a note that is opened and read,
  // and go to an editor when they mean to. The spec about the setting itself
  // starts without the choice (null). A choice the page has stored is left
  // as it is, a reload after it was changed in the settings included.
  notesOpenIn: ["Preview", { option: true }],
  page: async ({ page, firstRun, notesOpenIn }, use) => {
    if (!firstRun) {
      await page.addInitScript(() => {
        window.localStorage.setItem("settings/language", "en-US");
      });
    }
    if (notesOpenIn) {
      await page.addInitScript((mode) => {
        if (!window.localStorage.getItem("settings/defaultEditorMode")) {
          window.localStorage.setItem("settings/defaultEditorMode", mode);
        }
      }, notesOpenIn);
    }
    await use(page);
  },
  app: async ({ page }, use) => {
    await use(new CrossnoteApp(page));
  },
  // What the site's policy refuses, in every page of the test's browser
  // context (a window the app opens among them), each as the directive, what
  // was refused and the page it was refused in. A test fails on any but the
  // directives it says it makes the policy refuse, and fails as well if one
  // of those is never reported, so that an exception outlives no reason for
  // it (the browser reports an event handler attribute in hostile markup as
  // the sanitizer parses it, inert, as refused). Not seen: what a worker's
  // policy refuses.
  expectPolicyViolations: [[], { option: true }],
  policyViolations: [
    async ({ context, expectPolicyViolations }, use) => {
      const violations: string[] = [];
      await context.exposeBinding(
        "reportPolicyViolation",
        ({ frame }, violation: string) =>
          violations.push(`${violation} (in ${frame.url()})`),
      );
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) =>
          (
            window as unknown as {
              reportPolicyViolation: (violation: string) => void;
            }
          ).reportPolicyViolation(
            `${event.effectiveDirective} ${event.blockedURI}`,
          ),
        );
      });
      await use(violations);
      // A refusal is reported in a task of its own, after what it refused:
      // let each page still open run a frame and a task first, so that one
      // made just as the test ended is counted (a second at most, as a page
      // in the background may be given no frame).
      for (const page of context.pages()) {
        await page
          .evaluate(
            () =>
              new Promise((resolve) => {
                requestAnimationFrame(() => setTimeout(resolve));
                setTimeout(resolve, 1000);
              }),
          )
          .catch(() => {});
      }
      const directives = [
        ...new Set(violations.map((violation) => violation.split(" ")[0])),
      ];
      expect(
        directives.sort(),
        `refused: ${JSON.stringify(violations)}`,
      ).toEqual([...expectPolicyViolations].sort());
    },
    { auto: true },
  ],
});

export { expect };
