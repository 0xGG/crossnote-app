import { Facet, Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { fileMediaType, imageFileAccept } from "../utilities/media";
import { AttachmentError } from "../lib/attachments";

export interface AttachmentHost {
  upload(files: readonly File[]): Promise<string[]>;
  failed(error: unknown): void;
}
export const attachmentHost = Facet.define<
  AttachmentHost,
  AttachmentHost | undefined
>({ combine: (values) => values[0] });
type Insertion = { from: number; to: number; valid: boolean };

function dropKind(file: File): "text" | "unknown" | "attachment" {
  if (fileMediaType(file.name)) return "attachment";
  const mime = file.type.split(";", 1)[0].trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") return "unknown";
  if (
    mime.startsWith("text/") ||
    /^application\/(?:x-)?(?:yaml|toml|sql|javascript)$/.test(mime) ||
    /^application\/(?:[\w.+-]+\+)?(?:json|xml)$/.test(mime)
  )
    return "text";
  return "attachment";
}

function checkedText(text: string): string {
  // Tabs, line endings and form feeds are valid in ordinary text documents.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text))
    throw new AttachmentError("type");
  return text;
}

async function readDroppedFile(file: File): Promise<string> {
  if (dropKind(file) === "text") {
    // FileReader detects BOMs, but some browsers need an explicit charset.
    const charset = /;\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(
      file.type,
    );
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, charset?.[1] ?? charset?.[2]);
    });
    return checkedText(value);
  }

  // Unknown files can be large binaries. Reject invalid chunks as they arrive.
  const parts = [];
  const chunkSize = 64 * 1024;
  let decoder: TextDecoder | undefined;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, file.size);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    if (!decoder) {
      let encoding = "utf-8";
      if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
      if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
      decoder = new TextDecoder(encoding, { fatal: true });
    }
    let value: string;
    try {
      value = decoder.decode(bytes, { stream: end < file.size });
    } catch {
      throw new AttachmentError("type");
    }
    parts.push(checkedText(value));
  }
  return parts.join("");
}

async function readDroppedText(files: readonly File[], separator: string) {
  const parts = [];
  for (const file of files) parts.push(await readDroppedFile(file));
  return parts.join(separator);
}

const input = ViewPlugin.fromClass(
  class {
    private pending = new Set<Insertion>();
    private pickers = new Set<HTMLInputElement>();
    private destroyed = false;
    constructor(readonly view: EditorView) {}
    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      for (const at of this.pending) {
        update.changes.iterChangedRanges((from, to) => {
          if (from < at.to && to > at.from) at.valid = false;
        });
        const empty = at.from === at.to;
        at.from = update.changes.mapPos(at.from, 1);
        at.to = empty ? at.from : update.changes.mapPos(at.to, -1);
      }
    }
    destroy() {
      this.destroyed = true;
      this.pickers.forEach((picker) => picker.remove());
      this.pending.clear();
    }
    async insert(files: readonly File[], at: Insertion, asText = false) {
      const host = this.view.state.facet(attachmentHost);
      if (!host || this.view.state.readOnly || !files.length) {
        this.pending.delete(at);
        return;
      }
      this.pending.add(at);
      const beforeRead = this.view.state;
      try {
        let insert = asText
          ? await readDroppedText(files, this.view.state.lineBreak)
          : (await host.upload(files)).map((src) => `![](${src})`).join("\n");
        if (this.destroyed || !at.valid || this.view.state.readOnly)
          throw new AttachmentError("location");
        // Do not replace anything typed into the selected range while reading.
        this.pending.delete(at);
        if (asText) {
          for (const filter of this.view.state.facet(
            EditorView.clipboardInputFilter,
          ))
            insert = filter(insert, this.view.state);
          if (!insert) return;
        }
        const changes = this.view.state.changes({
          from: at.from,
          to: at.to,
          insert,
        });
        this.view.dispatch({
          changes,
          selection:
            asText && this.view.state === beforeRead && this.view.hasFocus
              ? {
                  anchor: changes.mapPos(at.from, -1),
                  head: changes.mapPos(at.to, 1),
                }
              : undefined,
          userEvent: asText ? "input.drop" : "input.paste",
        });
      } catch (error) {
        host.failed(error);
      } finally {
        this.pending.delete(at);
      }
    }
    pick(from: number, to: number) {
      if (this.view.state.readOnly) return;
      const at: Insertion = { from, to, valid: true };
      this.pending.add(at);
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = imageFileAccept;
      picker.multiple = true;
      picker.hidden = true;
      picker.setAttribute("aria-label", "Insert image");
      this.pickers.add(picker);
      const remove = () => {
        picker.remove();
        this.pickers.delete(picker);
      };
      picker.addEventListener(
        "change",
        () => {
          const files = Array.from(picker.files ?? []);
          remove();
          void this.insert(files, at);
        },
        { once: true },
      );
      picker.addEventListener(
        "cancel",
        () => {
          remove();
          this.pending.delete(at);
        },
        { once: true },
      );
      document.body.append(picker);
      picker.click();
    }
  },
  {
    eventHandlers: {
      paste(event) {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length || event.clipboardData?.getData("text/plain"))
          return false;
        event.preventDefault();
        const { from, to } = this.view.state.selection.main;
        void this.insert(files, { from, to, valid: true });
        return true;
      },
      dragover(event) {
        if (!event.dataTransfer?.types.includes("Files")) return false;
        event.preventDefault();
        event.dataTransfer.dropEffect = this.view.state.readOnly
          ? "none"
          : "copy";
        return true;
      },
      drop(event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return false;
        // CodeMirror imports text files at the drop position. Keep media and
        // mixed batches together so attachment validation can report errors.
        const kinds = files.map(dropKind);
        if (kinds.every((kind) => kind === "text")) return false;
        const asText = !kinds.includes("attachment");
        event.preventDefault();
        const coords = { x: event.clientX, y: event.clientY };
        const from = asText
          ? this.view.posAtCoords(coords, false)
          : (this.view.posAtCoords(coords) ??
            this.view.state.selection.main.head);
        if (asText && !this.view.state.readOnly) this.view.focus();
        void this.insert(files, { from, to: from, valid: true }, asText);
        return true;
      },
    },
  },
);

export const attachmentInput = Prec.highest(input);
export function pickImage(view: EditorView, from: number, to: number) {
  view.plugin(input)?.pick(from, to);
}
