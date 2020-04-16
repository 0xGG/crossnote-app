import { Note } from "../lib/crossnote";
import * as path from "path";
import { pfs } from "../lib/fs";

export async function resolveNoteImageSrc(note: Note, imageSrc: string) {
  if (!note) {
    return imageSrc;
  }
  if (imageSrc.startsWith("https://") || imageSrc.startsWith("data:")) {
    return imageSrc;
  } else if (imageSrc.startsWith("http://")) {
    return "";
  } else {
    return await loadImageAsBase64(note, imageSrc);
  }
}

export async function loadImageAsBase64(
  note: Note,
  imageSrc: string,
): Promise<string> {
  let imageFilePath;
  if (imageSrc.startsWith("/")) {
    imageFilePath = path.resolve(note.notebook.dir, "." + imageSrc);
  } else {
    imageFilePath = path.resolve(note.notebook.dir, imageSrc);
  }
  if (await pfs.exists(imageFilePath)) {
    const data: Uint8Array = new Uint8Array(
      // @ts-ignore
      (await pfs.readFile(imageFilePath)).split(","),
    );
    const base64 = Buffer.from(data.buffer).toString("base64");
    let imageType = path.extname(imageSrc).slice(1);
    if (imageType.match(/^svg$/i)) {
      imageType = "svg+xml";
    } else if (imageType.match(/^jpg$/i)) {
      imageType = "jpeg";
    }
    return `data:image/${imageType};base64,${base64}`;
  } else {
    return "";
  }
}
