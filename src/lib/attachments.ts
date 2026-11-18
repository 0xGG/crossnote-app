import path from "path-browserify";
import git from "isomorphic-git";
import type { Notebook } from "./notebook";
import { fs, pfs } from "./fs";
import { assertNotebookWritable, notebookOperation } from "./notebookOperation";
import { extensionForMediaType, mediaType } from "../utilities/media";

export const attachmentLimit = 20 * 1024 * 1024;

export class AttachmentError extends Error {
  constructor(readonly reason: "size" | "type" | "location" | "ignored") {
    super(reason);
  }
}

export function validateAttachment(file: File) {
  if (file.size > attachmentLimit) throw new AttachmentError("size");
  const extension =
    path.extname(file.name).toLowerCase() || extensionForMediaType(file.type);
  const type =
    extension && /^\.[a-z0-9]+$/.test(extension)
      ? mediaType(`file${extension}`)
      : undefined;
  if (
    !type ||
    (file.type &&
      file.type !== "application/octet-stream" &&
      file.type.split("/")[0] !== type.split("/")[0])
  )
    throw new AttachmentError("type");
  return extension!;
}

/** Completion includes staging and durable tree storage, as a note save does. */
export async function writeAttachment(
  notebook: Notebook,
  file: File,
  isCurrent: () => boolean = () => true,
): Promise<string> {
  const ext = validateAttachment(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return notebookOperation(notebook.dir, async () => {
    if (!isCurrent()) throw new AttachmentError("location");
    assertNotebookWritable(notebook.dir);
    const stem =
      Array.from(
        path
          .basename(file.name, path.extname(file.name))
          .replace(/[^\p{L}\p{N} _-]/gu, "_")
          .replace(/^[ .]+|[ .]+$/g, ""),
      )
        .slice(0, 50)
        .join("") || "attachment";
    let relative: string;
    do {
      relative = `assets/${stem}-${crypto.randomUUID()}${ext}`;
    } while (await pfs.exists(path.join(notebook.dir, relative)));
    // git.add silently skips ignored files. Do not promise a synchronized
    // attachment or override the notebook owner's ignore rules.
    if (
      !notebook.isLocal &&
      (await git.status({ fs, dir: notebook.dir, filepath: relative })) ===
        "ignored"
    )
      throw new AttachmentError("ignored");
    await pfs.mkdirp(path.join(notebook.dir, "assets"));
    await pfs.writeFile(path.join(notebook.dir, relative), bytes);
    await notebook.storeNote(relative);
    return "/" + relative.split("/").map(encodeURIComponent).join("/");
  });
}
