import "fake-indexeddb/auto";

// jsdom's Blob does not implement stream(), which isomorphic-git's deflate
// path needs (it feature-detects CompressionStream, which Node provides).
if (typeof Blob !== "undefined" && !Blob.prototype.stream) {
  Blob.prototype.stream = function (this: Blob) {
    const arrayBufferPromise = this.arrayBuffer();
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array(await arrayBufferPromise));
        controller.close();
      },
    });
  } as typeof Blob.prototype.stream;
}
