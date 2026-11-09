import type { Plugin } from "vite";

// The response headers the site sends, by path, in one place for both
// servers that serve the build: Cloudflare Pages, which reads them from the
// _headers file this writes into dist/, and `vite preview`, which the
// end-to-end tests run against and which sets them itself (its own headers
// option sends the same headers on every path). The dev server sends none.
//
// The Content-Security-Policy is sent as a header rather than written into
// index.html as a meta element, so that a page can have a policy of its own
// and hold directives a meta element cannot.

// Each directive and its sources, in the order they are sent.
function policy(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

// The app's pages: what the app loads from elsewhere, and no more.
// - Scripts: the site's alone. Nothing is run from text: no eval, no inline
//   script.
// - Styles: the site's and the ones the app writes into elements.
// - Images and media: anything a note links to on the web, and what the app
//   makes itself (images as data: addresses, read from local files; media
//   may also be blob: ones).
// - Fonts: the site's, and a few small ones written into its style sheets
//   as data: addresses (the editor's list bullets among them).
// - Connections: the site, git remotes and their proxies on the web, and a
//   git remote or proxy run on the user's own machine, which may be plain
//   http (http://[::1] is no address a policy can name).
// - No frames, no plugins, no base address elsewhere, no forms sent
//   anywhere, and no page elsewhere may show the app in a frame.
export const appPolicy = policy({
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "https:"],
  "media-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https:",
    "http://localhost:*",
    "http://127.0.0.1:*",
  ],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"],
});

interface Rule {
  // A path, or one that ends in * for every path that starts with what
  // comes before it, as in a _headers file.
  path: string;
  headers: Record<string, string>;
}

const rules: Rule[] = [
  { path: "/*", headers: { "Content-Security-Policy": appPolicy } },
];

function matches(path: string, pathname: string): boolean {
  return path.endsWith("*")
    ? pathname.startsWith(path.slice(0, -1))
    : pathname === path;
}

/**
 * The headers sent with the response for a path. A header that more than one
 * rule sets has their values joined with a comma, as Pages joins them.
 */
export function headersFor(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of rules) {
    if (!matches(rule.path, pathname)) continue;
    for (const [name, value] of Object.entries(rule.headers)) {
      headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
    }
  }
  return headers;
}

export function headersFile(): string {
  const blocks = rules.map(
    (rule) =>
      `${rule.path}\n` +
      Object.entries(rule.headers)
        .map(([name, value]) => `  ${name}: ${value}\n`)
        .join(""),
  );
  return `# Written by the build from site-headers.ts.\n${blocks.join("\n")}`;
}

export function siteHeaders(): Plugin {
  return {
    name: "crossnote:site-headers",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: headersFile(),
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const { pathname } = new URL(request.url ?? "/", "http://localhost");
        for (const [name, value] of Object.entries(headersFor(pathname))) {
          response.setHeader(name, value);
        }
        next();
      });
    },
  };
}
