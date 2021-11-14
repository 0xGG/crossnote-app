if ("function" === typeof importScripts) {
  importScripts(
    "https://storage.googleapis.com/workbox-cdn/releases/6.1.1/workbox-sw.js",
  );
  /* global workbox */
  if (workbox) {
    console.log("Workbox is loaded");

    /* injection point for manifest files.  */
    workbox.precaching.precacheAndRoute([{"revision":"2d98b1622032d9951a077670afb53f1d","url":"assets/emoji/twitter/64.png"},{"revision":"4f429bf5c953825aa45d691abe208cb9","url":"assets/manifest-icon-192.png"},{"revision":"e00af3595dde18bb08e737e4989ce141","url":"assets/manifest-icon-512.png"},{"revision":"a603db26591594692651f763e9f96be0","url":"deps/echarts-gl/echarts-gl.min.js"},{"revision":"96877f62ac512e6237be3ddcd61c0f9c","url":"deps/echarts/echarts.min.js"},{"revision":"655728740b80652ea50e659edb7d273c","url":"deps/marked/marked.min.js"},{"revision":"b321e9ceb5e0f2c766990747604c43d3","url":"deps/mermaid/mermaid.core.js"},{"revision":"24a592b1a9abe39df5f7e862917cb1ac","url":"deps/mermaid/mermaid.min.js"},{"revision":"2957bccff80a89590386430d08d0c3ce","url":"deps/plantuml-encoder/plantuml-encoder.min.js"},{"revision":"b362cf65e08bce6143c224c989bc8bd6","url":"deps/prism/prism.js"},{"revision":"72af3b883f97adca1ba9ab7b446f381b","url":"deps/vega-embed/vega-embed.min.js"},{"revision":"07186f4877cdd1075c9797cb54d26c71","url":"deps/vega-lite/vega-lite.min.js"},{"revision":"9df1daba283619a34c5625e0f456ba02","url":"deps/vega/vega.min.js"},{"revision":"498f6becfe4b4cd798f4e394559c9471","url":"deps/wavedrom/skins/default.js"},{"revision":"ceb32ac22d37f14433692ef3e1c83c57","url":"deps/wavedrom/wavedrom.min.js"},{"revision":"ea5de727cbca4b9176c8595a464ed6b5","url":"deps/yamljs/yaml.min.js"},{"revision":"cffaa34e0894e46b4183fbda039f3a42","url":"logo.svg"},{"revision":"2e60df9f4a63707deae443598f745afc","url":"logo192.png"},{"revision":"21bd3603cdcc62f38f25a7c4ebed89f2","url":"logo512.png"},{"revision":"afe44c87aad234a741b84c00eabbaee8","url":"logo64.png"},{"revision":"d41d8cd98f00b204e9800998ecf8427e","url":"styles/echomd@^1.0.4/common/color.css"},{"revision":"d41d8cd98f00b204e9800998ecf8427e","url":"styles/echomd@^1.0.4/common/constant.css"},{"revision":"d41d8cd98f00b204e9800998ecf8427e","url":"styles/echomd@^1.0.4/common/math.css"},{"revision":"4e74b94ec8d1dabd584211209a0f1187","url":"styles/echomd@^1.0.4/editor_themes/dark.css"},{"revision":"af6f22e64d8daf5fb96dea355e13e29e","url":"styles/echomd@^1.0.4/editor_themes/light.css"},{"revision":"95ffc6a7da4d4705d9ee06a86524d2f2","url":"styles/echomd@^1.0.4/editor_themes/one-dark.css"},{"revision":"a4b175b9ebe5f7b07f006ae0a01d48dc","url":"styles/echomd@^1.0.4/editor_themes/solarized-light.css"},{"revision":"49be949b20f748ec885c8527a08c2b7e","url":"styles/echomd@^1.0.4/index.js"},{"revision":"61822790d61585348bf29b15f60d9373","url":"styles/echomd@^1.0.4/preview_themes/github-dark.css"},{"revision":"2e6e3196e115f190aa7273c1d1f2d7dd","url":"styles/echomd@^1.0.4/preview_themes/github-light.css"},{"revision":"d41d8cd98f00b204e9800998ecf8427e","url":"styles/echomd@^1.0.4/preview_themes/github.css"},{"revision":"d41d8cd98f00b204e9800998ecf8427e","url":"styles/echomd@^1.0.4/preview_themes/math.css"},{"revision":"eebdcbcc61f7da80e949b0e33cbb018b","url":"styles/echomd@^1.0.4/preview_themes/one-dark.css"},{"revision":"6750b047a41673303b7cca189a0b1f14","url":"styles/echomd@^1.0.4/preview_themes/solarized-light.css"},{"revision":"b1aba04470f34c403092b5834dd9c605","url":"styles/echomd@^1.0.4/prism_themes/github.css"},{"revision":"05a887fe7bd1ef42dfd82e67b116c847","url":"styles/echomd@^1.0.4/prism_themes/monokai.css"},{"revision":"41dd6125efb6b516970f63d9a7e8bb10","url":"styles/echomd@^1.0.4/prism_themes/one-dark.css"},{"revision":"3e19271e6e917500a0c0d3e7f379c6d1","url":"styles/echomd@^1.0.4/prism_themes/solarized-light.css"}]);

    /* custom cache rules*/
    const handler = workbox.precaching.createHandlerBoundToURL(
      `${
        self.location.hostname.match(/0xgg\./i) ? "/crossnote" : "" // Check GitHub Pages
      }/index.html`,
    );
    const navigationRoute = new workbox.routing.NavigationRoute(handler, {
      denylist: [
        // Exclude URLs starting with /_, as they're likely an API call
        new RegExp("^/_"),
        // Exclude any URLs whose last part seems to be a file extension
        // as they're likely a resource and not a SPA route.
        // URLs containing a "?" character won't be blacklisted as they're likely
        // a route with query params (e.g. auth callbacks).
        new RegExp("/[^/?]+\\.[^/]+$"),
      ],
    });
    workbox.routing.registerRoute(navigationRoute);

    workbox.routing.registerRoute(
      /\.(?:png|gif|jpg|jpeg)$/,
      new workbox.strategies.CacheFirst({
        cacheName: "images",
        plugins: [
          new workbox.expiration.ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          }),
        ],
      }),
    );

    self.addEventListener("message", (event) => {
      if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
      }
    });
  } else {
    console.log("Workbox could not be loaded. No Offline support");
  }
}
