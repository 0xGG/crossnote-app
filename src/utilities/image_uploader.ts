/**
 * Upload image to sm.ms
 * @param filePath
 */
export async function smmsUploadImages(files: File[] = []): Promise<string[]> {
  const promises = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.match("image.*")) {
      continue;
    }
    promises.push(
      new Promise<string>((resolve, reject) => {
        const headers = {
          // "Content-Type": "multipart/form-data" // <= Adding this will cause problem.
        };
        const data = new FormData();
        data.append("smfile", file);
        data.append("format", "json");
        fetch("https://sm.ms/api/v2/upload", {
          method: "POST",
          mode: "cors",
          headers,
          referrer: "",
          body: data
        })
          .then(response => response.json())
          .then(json => {
            if (json["success"]) {
              return resolve(json["data"]["url"]);
            } else if (
              json["code"] === "image_repeated" ||
              (json["code"] === "exception" &&
                json["message"].match(/this image exists at:/))
            ) {
              return resolve(json["message"].match(/https:\/\/.+$/)[0]);
            } else {
              return reject(json["message"]);
            }
          })
          .catch(error => {
            return reject("Failed to connect to sm.ms host");
          });
      })
    );
  }
  return await Promise.all(promises);
}
