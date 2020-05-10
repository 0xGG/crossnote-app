import { Note } from "../lib/crossnote";
import * as path from "path";
import { pfs } from "../lib/fs";
import { NotebookFieldsFragment } from "../generated/graphql";

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
  note: Note,
  imageSrc: string,
): Promise<string> {
  let imageFilePath;
  if (imageSrc.startsWith("/")) {
    imageFilePath = path.resolve(note.notebook.dir, "." + imageSrc);
  } else {
    imageFilePath = path.join(
      note.notebook.dir,
      path.dirname(note.filePath),
      imageSrc,
    );
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
