// Check
// * https://stackoverflow.com/questions/54840929/react-cra-sw-cache-public-folder
// * https://developers.google.com/web/tools/workbox/reference-docs/latest/module-workbox-webpack-plugin.GenerateSW#GenerateSW
// * https://developers.google.com/web/tools/workbox/reference-docs/latest/module-workbox-build#.generateSW

module.exports = function override(config, env) {
  config.plugins = config.plugins.map((plugin) => {
    if (plugin.constructor.name === "GenerateSW") {
      return () => {};
    } else {
      return plugin;
    }
  });
  return config;
};
