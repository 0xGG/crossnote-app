import { readFileSync } from "node:fs";
import { appPolicy, headersFile } from "../site-headers";
import { expect, test } from "./fixtures";

// The policy comes with the page's response, from site-headers.ts, which
// also writes the _headers file the deployed site is served by; the page
// holds none of its own.
test("sends the page's policy as a header, as the deployed site does", async ({
  page,
}) => {
  // The policy, written out: a change to it is a change to this test.
  expect(appPolicy).toBe(
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toBe(appPolicy);
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy" i]'),
  ).toHaveCount(0);
  // A page the site does not have is the app's, with the app's policy.
  const elsewhere = await page.request.get("/no/such/page");
  expect(elsewhere.headers()["content-security-policy"]).toBe(appPolicy);
  expect(
    readFileSync(new URL("../dist/_headers", import.meta.url), "utf-8"),
  ).toBe(headersFile());
});

// Fetches each address from the page, whether anything answers there or
// not: a connection that fails and one the policy refuses look the same to
// fetch, so what tells them apart is the policy's report.
const fetchEach = (addresses: string[]) =>
  Promise.all(
    addresses.map((address) =>
      fetch(address, { mode: "no-cors" }).then(
        () => {},
        () => {},
      ),
    ),
  );

// A git remote or proxy on the web, or on the user's own machine over plain
// http, is one the policy lets the app connect to.
test("lets the app connect to git remotes on the web and on this machine", async ({
  app,
  page,
  policyViolations,
}) => {
  await app.open();
  await page.evaluate(fetchEach, [
    "https://localhost:9/",
    "http://localhost:9/",
    "http://127.0.0.1:9/",
  ]);
  // A refusal would be reported in a task of its own.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  expect(policyViolations).toEqual([]);
});

test.describe("connections elsewhere over plain http", () => {
  test.use({ expectPolicyViolations: ["connect-src"] });

  // Another machine's address over plain http, a name under .localhost, and
  // this machine's IPv6 address, which a policy cannot name.
  test("refuses them", async ({ app, page, policyViolations }) => {
    await app.open();
    const addresses = [
      "http://192.0.2.1:9/",
      "http://git.localhost:9/",
      "http://[::1]:9/",
    ];
    await page.evaluate(fetchEach, addresses);
    // Each refused, and nothing else: the directive and the address.
    await expect
      .poll(() =>
        policyViolations.map((violation) =>
          violation.split(" ").slice(0, 2).join(" "),
        ),
      )
      .toEqual(
        expect.arrayContaining(
          addresses.map((address) => `connect-src ${address}`),
        ),
      );
    expect(policyViolations).toHaveLength(addresses.length);
  });
});

test.describe("a base address elsewhere, plugin content and frames", () => {
  test.use({
    expectPolicyViolations: ["base-uri", "object-src", "frame-src"],
  });

  // What the page's policy holds the page to, whatever ends up in it.
  test("refuses them", async ({ app, page, policyViolations }) => {
    await app.open();
    const baseURI = await page.evaluate(() => {
      const base = document.createElement("base");
      base.href = "https://example.org/";
      document.head.appendChild(base);
      const baseURI = document.baseURI;
      base.remove();
      const object = document.createElement("object");
      object.data = "/favicon.ico";
      document.body.appendChild(object);
      const frame = document.createElement("iframe");
      frame.src = "/favicon.ico";
      document.body.appendChild(frame);
      return baseURI;
    });
    expect(new URL(baseURI).origin).toBe(new URL(page.url()).origin);
    // The object's and the frame's are reported once they try to load.
    await expect
      .poll(() =>
        policyViolations.map((violation) => violation.split(" ")[0]).sort(),
      )
      .toEqual(["base-uri", "frame-src", "object-src"]);
  });
});

// Runs eval in the page's own code, a callback of an event it sends itself:
// what a test runs through DevTools, as page.evaluate does, may eval all
// the same. Says what eval gave, or the error it threw.
const evalInPage = () =>
  new Promise<string>((resolve) => {
    document.addEventListener(
      "try-eval",
      () => {
        try {
          resolve(String(eval("'ran'")));
        } catch (error) {
          resolve((error as Error).name);
        }
      },
      { once: true },
    );
    setTimeout(() => document.dispatchEvent(new Event("try-eval")));
  });

test.describe("code made from text", () => {
  test.use({ expectPolicyViolations: ["script-src", "script-src-elem"] });

  // Whatever a note or a library brings into the page, no code made from
  // text runs: neither eval nor a script written into the page.
  test("runs none of it on the page", async ({ app, page }) => {
    await app.open();
    const evaluated = await page.evaluate(evalInPage);
    expect(
      await page.evaluate((evaluated) => {
        const script = document.createElement("script");
        script.textContent = "window.fromScript = 'ran'";
        document.head.append(script);
        return {
          evaluated,
          script: (window as any).fromScript ?? "refused",
        };
      }, evaluated),
    ).toEqual({ evaluated: "EvalError", script: "refused" });
  });
});
