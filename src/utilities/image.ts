import Crossnote, { Note } from "../lib/crossnote";

export async function resolveNoteImageSrc(
  crossnote: Crossnote,
  note: Note,
  imageSrc: string,
) {
  if (!note || !crossnote) {
    return imageSrc;
  }
  if (imageSrc.startsWith("https://") || imageSrc.startsWith("data:")) {
    return imageSrc;
  } else if (imageSrc.startsWith("http://")) {
    return "";
  } else {
    return await crossnote.loadImageAsBase64(note, imageSrc);
  }
}
