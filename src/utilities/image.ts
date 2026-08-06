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
    const data: Uint8Array<ArrayBuffer> = await pfs.readFile(imageFilePath);
    let imageType = path.extname(imageSrc).slice(1);
    if (imageType.match(/^svg$/i)) {
      imageType = "svg+xml";
    } else if (imageType.match(/^jpg$/i)) {
      imageType = "jpeg";
    }
    const blob = new Blob([data], { type: `image/${imageType}` });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } else {
    return "";
  }
}

export function isFileAnImage(fileName: string) {
  return !!fileName.match(/\.(jpg|jpeg|png|gif|svg)$/i);
}
