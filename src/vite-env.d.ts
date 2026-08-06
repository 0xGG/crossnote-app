/// <reference types="vite/client" />

// Build metadata injected by vite.config.ts (define)
declare const __GIT_COMMIT__: { logMessage: string; hash: string };

// Untyped CommonJS modules
declare module "@0xgg/echomd/core";
