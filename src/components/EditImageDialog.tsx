import type { Text } from "@codemirror/state";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NoteEditor } from "../editor/noteEditor";
import type { ImageMarkup } from "../editor/widgets";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";

/** An image of a note being edited: what its markup says, and where it is. */
export type EditedImage = ImageMarkup & {
  from: number;
  to: number;
  /** The document when this image was clicked; offsets belong to it alone. */
  document: Text;
};

interface Props {
  open: boolean;
  onClose: () => void;
  editor: NoteEditor | null;
  image: EditedImage | null;
  note: Note;
}

const ImageWrapper = styled(Box)({
  textAlign: "center",
});

const ImagePreview = styled("img")({
  maxWidth: "100%",
  maxHeight: "400px",
});

export default function EditImageDialog(props: Props) {
  const { t } = useTranslation();
  const { editor, image } = props;
  const selected = props.open && editor ? image : null;
  const [previous, setPrevious] = useState(selected);
  const [imageSrc, setImageSrc] = useState(selected?.src ?? "");
  const [imageAlt, setImageAlt] = useState(selected?.alt ?? "");
  const [imageTitle, setImageTitle] = useState(selected?.title ?? "");
  const [changed, setChanged] = useState(
    !!selected && selected.document !== editor.document.doc,
  );
  if (selected !== previous) {
    setPrevious(selected);
    if (selected) {
      setImageSrc(selected.src);
      setImageAlt(selected.alt);
      setImageTitle(selected.title);
      setChanged(selected.document !== editor.document.doc);
    }
  }
  // What the preview shows, with the source and the note it was looked up
  // for: a source relative to the note is resolved against its folder.
  const [preview, setPreview] = useState<{
    src: string;
    note: Note;
    url: string;
  }>({ src: "", note: null, url: "" });

  // Offsets are valid only in the document clicked. Even another picture
  // with the same spelling at that offset is not necessarily this picture.
  const replaceImage = useCallback(
    (text: string) => {
      if (!editor || !image) {
        return false;
      }
      if (image.document === editor.document.doc) {
        editor.view.dispatch({
          changes: { from: image.from, to: image.to, insert: text },
          userEvent: "input",
        });
        return true;
      }
      setChanged(true);
      return false;
    },
    [editor, image],
  );

  const deleteImage = useCallback(() => {
    if (replaceImage("")) {
      props.onClose();
    }
  }, [replaceImage, props]);

  const updateImage = useCallback(() => {
    // URL and title fields hold decoded values. Escape them once for Markdown;
    // Whitespace, parentheses or a leading "<" need the angle-bracket form.
    const src = imageSrc.trim();
    const escaped = src.replace(/&/g, "&amp;").replace(/\\/g, "\\\\");
    const destination = /[\s()]|^</.test(src)
      ? `<${escaped.replace(/[<>]/g, "\\$&")}>`
      : escaped;
    const replaced = replaceImage(
      imageTitle.trim().length
        ? `![${imageAlt.trim()}](${destination} ${JSON.stringify(imageTitle.replace(/&/g, "&amp;"))})`
        : `![${imageAlt.trim()}](${destination})`,
    );
    if (replaced) {
      props.onClose();
    }
  }, [replaceImage, props, imageAlt, imageSrc, imageTitle]);

  useEffect(() => {
    if (selected) return editor.document.onChange(() => setChanged(true));
  }, [selected, editor]);

  useEffect(() => {
    // A lookup can end after the source has moved on, a local file being read
    // more slowly than a web address is resolved; only the latest one counts.
    if (!props.open || !imageSrc) return;
    let latest = true;
    resolveNoteImageSrc(props.note, imageSrc)
      .catch(() => "")
      .then((url) => {
        if (latest) {
          setPreview({ src: imageSrc, note: props.note, url });
        }
      });
    return () => {
      latest = false;
    };
  }, [imageSrc, props.note, props.open]);

  if (!editor || !image) {
    return null;
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} style={{ zIndex: 3001 }}>
      <DialogTitle>{t("edit-image-dialog/title")}</DialogTitle>
      <DialogContent style={{ width: "400px", maxWidth: "100%" }}>
        {changed && (
          <Alert severity="warning">
            {t("edit-image-dialog/note-changed")}
          </Alert>
        )}
        <ImageWrapper>
          <ImagePreview
            // Nothing until the source in the field has been looked up for
            // this note, rather than the image looked up before it.
            src={
              preview.src === imageSrc && preview.note === props.note
                ? preview.url || undefined
                : undefined
            }
            alt={imageAlt}
            title={imageTitle}
          ></ImagePreview>{" "}
        </ImageWrapper>
        <TextField
          autoFocus={true}
          value={imageSrc}
          helperText={t("edit-image-dialog/image-url")}
          fullWidth={true}
          onChange={(event) => setImageSrc(event.target.value)}
        ></TextField>
        <TextField
          autoFocus={true}
          value={imageTitle}
          helperText={t("edit-image-dialog/image-title")}
          fullWidth={true}
          onChange={(event) => setImageTitle(event.target.value)}
        ></TextField>
        <TextField
          autoFocus={true}
          value={imageAlt}
          helperText={t("edit-image-dialog/image-alt-text")}
          fullWidth={true}
          onChange={(event) => setImageAlt(event.target.value)}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          disabled={changed}
          variant={"contained"}
          color={"primary"}
          onClick={updateImage}
        >
          {t("general/update")}
        </Button>
        <Button
          disabled={changed}
          variant={"contained"}
          color={"secondary"}
          onClick={deleteImage}
        >
          {t("general/Delete")}
        </Button>
        <Button onClick={props.onClose}> {t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
