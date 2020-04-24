// Check
// * https://stackoverflow.com/questions/54840929/react-cra-sw-cache-public-folder
// * https://developers.google.com/web/tools/workbox/reference-docs/latest/module-workbox-webpack-plugin.GenerateSW#GenerateSW
// * https://developers.google.com/web/tools/workbox/reference-docs/latest/module-workbox-build#.generateSW

const { override, adjustWorkbox } = require("customize-cra");
module.exports = override(
  // Override the GenerateSW configs.
  adjustWorkbox((wb) => {
    console.log(wb);
    return Object.assign(wb, {
      exclude: [...(wb.exclude || []), ...[/\.scss$/]],
      globDirectory: "build",
      globPatterns: [
        ...(wb.globPatterns || []),
        "/styles/**/*.css",
        "styles/**/*.css",
        "**/*.css",
        "/**/*.css",
      ],
    });
  }),
);
