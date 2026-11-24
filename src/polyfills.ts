import { Buffer } from "buffer";
// PouchDB's browser build imports the Node "events" builtin and expects the
// bundler to resolve it to the userland package. Nothing else in src touches
// it, so anchor the import here to keep dependency pruning from dropping the
// package (Vite would then stub it out and PouchDB would crash at startup).
import "events";

// isomorphic-git's index and pack code uses the Buffer global. Load the
// browser implementation before the application imports Git. Node's Buffer
// stays in place under Vitest.
if (!("Buffer" in globalThis)) {
  Object.assign(globalThis, { Buffer });
}
