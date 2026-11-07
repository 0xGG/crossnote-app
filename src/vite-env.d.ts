/// <reference types="vite/client" />

// Build metadata injected by vite.config.ts (define)
declare const __GIT_COMMIT__: { logMessage: string; hash: string };
// Where the site serves CodeMirror's language modes, e.g. /deps/codemirror@5.65.21/
declare const __CODEMIRROR_MODES__: string;

// Untyped CommonJS modules
declare module "@0xgg/echomd/core";
declare module "markdown-it-emoji";
declare module "markdown-it-footnote";
declare module "markdown-it-for-inline";
declare module "markdown-it-ins";
declare module "markdown-it-mark";
declare module "markdown-it-sub";
declare module "markdown-it-sup";
// Prism's core, which puts itself on the page as window.Prism
declare module "prismjs/components/prism-core";
// echarts-gl, which adds its 3D and WebGL charts to echarts as it loads
declare module "echarts-gl";
