import "fake-indexeddb/auto";

// jsdom lays nothing out, and its Range has no boxes to give. CodeMirror 6
// asks for them when it measures a line of text, a frame after it draws; an
// empty answer has it keep its own estimate.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () =>
    Object.assign([], {
      item: (): DOMRect | null => null,
    }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
}

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
