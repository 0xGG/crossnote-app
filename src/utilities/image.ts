import * as path from "path";
import { NotebookFieldsFragment } from "../generated/graphql";
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

export function resolveNotebookFilePath(
  notebook: NotebookFieldsFragment,
  filePath: string,
) {
  if (!notebook) {
    return filePath;
  }
  if (filePath.startsWith("https://") || filePath.startsWith("data:")) {
    return filePath;
  } else if (filePath.startsWith("http://")) {
    return "";
  } else {
    const { gitURL, gitBranch } = notebook;
    const gitURLArr = gitURL.replace("https://", "").split("/");
    const gitHost = gitURLArr[0].toLowerCase();
    const gitOwner = gitURLArr[1];
    const gitRepo = gitURLArr[2].replace(/\.git$/, "");
    let outFilePath = "";
    filePath = filePath.replace(/^\/+/, "").replace(/^\.\/+/, "");
    if (gitHost === "github.com") {
      outFilePath = `https://github.com/${gitOwner}/${gitRepo}/raw/${gitBranch}/${filePath}`;
    } else if (gitHost === "gitlab.com") {
      outFilePath = `https://gitlab.com/${gitOwner}/${gitRepo}/-/raw/${gitBranch}/${filePath}`;
    } else if (gitHost === "gitee.com") {
      outFilePath = `https://gitee.com/${gitOwner}/${gitRepo}/raw/${gitBranch}/${filePath}`;
    } else if (gitHost === "gitea.com") {
      outFilePath = `https://gitea.com/${gitOwner}/${gitRepo}/raw/branch/${gitBranch}/${filePath}`;
    }

    return outFilePath;
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

export function isFileAnImage(fileName: string) {
  return !!fileName.match(/\.(jpg|jpeg|png|gif|svg)$/i);
}
