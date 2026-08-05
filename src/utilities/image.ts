import * as path from "path";
import { pfs } from "../lib/fs";
import { Note } from "../lib/note";

export async function resolveNoteImageSrc(note: Note, imageSrc: string) {
  if (!note) {
    return imageSrc;
  }
  if (imageSrc.startsWith("https://") || imageSrc.startsWith("data:")) {
    return imageSrc;
  } else if (imageSrc.startsWith("http://")) {
    return "";
  } else {
    return await loadImageAsBase64(note.notebookPath, note.filePath, imageSrc);
  }
}

export async function loadImageAsBase64(
  notebookPath: string,
  noteFilePath: string,
  imageSrc: string,
): Promise<string> {
  let imageFilePath;
  if (imageSrc.startsWith("/")) {
    imageFilePath = path.resolve(notebookPath, "." + imageSrc);
  } else {
    imageFilePath = path.join(
      notebookPath,
      path.dirname(noteFilePath),
      imageSrc,
    );
  }
  if (await pfs.exists(imageFilePath)) {
    // @ts-ignore
    const data: Uint8Array = await pfs.readFile(imageFilePath);
    // btoa expects a binary string; convert in chunks to avoid call-stack
    // limits on large images. (Buffer is not available in the browser.)
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < data.length; i += chunkSize) {
      binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
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

export function isFileAnImage(fileName: string) {
  return !!fileName.match(/\.(jpg|jpeg|png|gif|svg)$/i);
}
