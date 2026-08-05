import { Buffer } from "buffer";
// PouchDB's browser build imports the Node "events" builtin and expects the
// bundler to resolve it to the userland package. Nothing else in src touches
// it, so anchor the import here to keep dependency pruning from dropping the
// package (Vite would then stub it out and PouchDB would crash at startup).
import "events";

// isomorphic-git 1.3.1 was written for the webpack-4 era, when bundlers
// injected a Buffer global automatically; its index serialization (git.add
// and friends) dereferences the bare `Buffer` identifier. Vite provides no
// Node globals, so supply the userland implementation explicitly. This
// module must stay the first import of the application entry.
globalThis.Buffer = globalThis.Buffer || Buffer;
