import { Buffer } from "buffer";

// isomorphic-git 1.3.1 was written for the webpack-4 era, when bundlers
// injected a Buffer global automatically; its index serialization (git.add
// and friends) dereferences the bare `Buffer` identifier. Vite provides no
// Node globals, so supply the userland implementation explicitly. This
// module must stay the first import of the application entry.
globalThis.Buffer = globalThis.Buffer || Buffer;
