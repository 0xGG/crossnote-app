import path from "path-browserify";
import type { Note } from "../lib/note";
import { pfs } from "../lib/fs";

const types: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
};

export function fileMediaType(name: string): string | undefined {
  const extension = path.extname(name).slice(1).toLowerCase();
  const type = types[extension];
  return typeof type === "string" ? type : undefined;
}

export function mediaType(src: string): string | undefined {
  let pathname = src;
  if (/^https:\/\//i.test(src)) {
    try {
      pathname = new URL(src).pathname;
    } catch {
      return undefined;
    }
  } else if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(src)) return undefined;
  return fileMediaType(pathname.split(/[?#]/)[0]);
}

export function mediaKind(
  src: string,
): "image" | "audio" | "video" | undefined {
  return mediaType(src)?.split("/")[0] as
    "image" | "audio" | "video" | undefined;
}

export const imageFileAccept = Object.keys(types)
  .filter((ext) => types[ext].startsWith("image/"))
  .map((ext) => `.${ext}`)
  .join(",");

export function extensionForMediaType(type: string): string | undefined {
  const entry = Object.entries(types).find(
    ([, mime]) => mime === type.toLowerCase(),
  );
  return entry ? `.${entry[0]}` : undefined;
}

/** Resolve once-decoded paths without ever reading outside this notebook. */
export function notebookMediaPath(
  notebookPath: string,
  noteFilePath: string,
  src: string,
  encoding: "uri" | "literal" = "uri",
): string {
  let decoded: string;
  try {
    decoded = encoding === "literal" ? src : decodeURIComponent(src);
  } catch {
    // Live Markdown can contain a literal percent in an existing filename.
    // Treat malformed escapes literally; the same root check still applies.
    decoded = src;
  }
  if (
    !decoded ||
    /[\0\\]/.test(decoded) ||
    /^[a-z][a-z\d+.-]*:|^\/\//i.test(decoded)
  )
    throw new Error("Invalid attachment path");
  const root = path.resolve(notebookPath);
  const resolved = decoded.startsWith("/")
    ? path.resolve(root, `.${decoded}`)
    : path.resolve(root, path.dirname(noteFilePath), decoded);
  const relative = path.relative(root, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  )
    throw new Error("Attachment is outside the notebook");
  return resolved;
}

export interface MediaSource {
  url: string;
  dispose(): void;
}

export async function resolveNoteMedia(
  note: Note | null,
  src: string,
): Promise<MediaSource> {
  if (/^https:\/\//i.test(src)) return { url: src, dispose() {} };
  if (!note || /^[a-z][a-z\d+.-]*:|^\/\//i.test(src))
    throw new Error("Unsupported media address");
  const file = notebookMediaPath(note.notebookPath, note.filePath, src);
  const data = (await pfs.readFile(file)) as Uint8Array;
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data)], {
      type: mediaType(src) ?? "application/octet-stream",
    }),
  );
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
