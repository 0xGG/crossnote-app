const defaultProps = require("emoji-mart/dist/utils/shared-default-props");
const backgroundImageFn = defaultProps.EmojiDefaultProps.backgroundImageFn;
const fs = require("fs");
const path = require("path");
const request = require("request");
const mkdirp = require("mkdirp");

function downloadSheet(size = 64) {
  const url = backgroundImageFn("twitter", size);
  const targetFile = path.resolve(
    __dirname,
    `./public/assets/emoji/twitter/${size}.png`,
  );
  mkdirp.sync(path.dirname(targetFile));
  const file = fs.createWriteStream(targetFile);
  console.log(`Downloading ${url} to ${targetFile}`);
  const sendReq = request.get(url);

  sendReq.on("response", (response) => {
    if (response.statusCode !== 200) {
      return console.error("Response status was " + response.statusCode);
    }

    sendReq.pipe(file);
  });

  // close() is async, call cb after close completes
  file.on("finish", () => {
    console.log(`Downloaded ${url} to ${targetFile}`);
    file.close();
  });

  // check for request errors
  sendReq.on("error", (err) => {
    fs.unlink(targetFile);
    return console.error(err.message);
  });

  file.on("error", (err) => {
    // Handle errors
    console.error(err.message);
    fs.unlink(targetFile); // Delete the file async. (But we don't check the result)
  });
}

downloadSheet(64);
