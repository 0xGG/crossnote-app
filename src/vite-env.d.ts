/// <reference types="vite/client" />

// Build metadata injected by vite.config.ts (define)
declare const __GIT_COMMIT__: { logMessage: string; hash: string };
// Where the site serves CodeMirror's language modes, e.g. /deps/codemirror@5.65.21/
declare const __CODEMIRROR_MODES__: string;

// Untyped CommonJS modules
declare module "@0xgg/echomd/core";
