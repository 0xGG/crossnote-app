/// <reference types="vite/client" />

// Build metadata injected by vite.config.ts (define)
declare const __GIT_COMMIT__: { logMessage: string; hash: string };

// Untyped CommonJS modules
declare module "markdown-it-emoji";
declare module "markdown-it-footnote";
declare module "markdown-it-for-inline";
declare module "markdown-it-ins";
declare module "markdown-it-mark";
declare module "markdown-it-sub";
declare module "markdown-it-sup";
// Prism's core, which puts itself on the page as window.Prism
declare module "prismjs/components/prism-core";
