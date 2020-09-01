const fs = require("fs");
const packageJSON = require("./package.json");
packageJSON.homepage = "https://crossnote.app";
fs.writeFileSync(
  "./package.json",
  JSON.stringify(packageJSON, null, "  ") + "\n",
);
