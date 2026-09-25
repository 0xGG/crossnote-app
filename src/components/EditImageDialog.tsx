import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { Editor as CodeMirrorEditor, TextMarker } from "codemirror";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";

interface Props {
  open: boolean;
  onClose: () => void;
  editor: CodeMirrorEditor;
  marker: TextMarker;
  imageElement: HTMLImageElement;
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
  const editor = props.editor;
  const marker = props.marker;
  const imageElement = props.imageElement;
  const [imageSrc, setImageSrc] = useState<string>("");
  const [imageAlt, setImageAlt] = useState<string>("");
  const [imageTitle, setImageTitle] = useState<string>("");
  // What the preview shows, with the source it was looked up for.
  const [preview, setPreview] = useState<{ src: string; url: string }>({
    src: "",
    url: "",
  });

  const deleteImage = useCallback(() => {
    if (!imageElement || !editor || !marker) {
      return;
    }
    const pos = marker.find();
    editor.replaceRange("", pos.from, pos.to);
    props.onClose();
  }, [imageElement, editor, marker, props]);

  const updateImage = useCallback(() => {
    if (!imageElement || !editor || !marker) {
      return;
    }
    const pos = marker.find();
    if (!pos) return;
    if (imageTitle.trim().length) {
      editor.replaceRange(
        `![${imageAlt.trim()}](${imageSrc.trim()} ${JSON.stringify(
          imageTitle,
        )})`,
        pos.from,
        pos.to,
      );
    } else {
      editor.replaceRange(
        `![${imageAlt.trim()}](${imageSrc.trim()})`,
        pos.from,
        pos.to,
      );
    }
    props.onClose();
  }, [imageElement, editor, marker, props, imageAlt, imageSrc, imageTitle]);

  // Filled from the image each time the dialog opens: the image clicked may
  // be the one a cancelled edit left its values behind for. The preview
  // follows the source, which another image may share.
  useEffect(() => {
    if (props.open && imageElement && marker && editor) {
      setImageSrc(
        imageElement.getAttribute("data-src") || imageElement.src || "",
      );
      setImageTitle(imageElement.title || "");
      setImageAlt(imageElement.alt || "");
    }
  }, [props.open, imageElement, marker, editor]);

  // A kanban card's images have no note to be resolved against; the lookup
  // hands such sources back as they are.
  useEffect(() => {
    // A lookup can end after the source has moved on, a local file being read
    // more slowly than a web address is resolved; only the latest one counts.
    let latest = true;
    resolveNoteImageSrc(props.note, imageSrc)
      .catch(() => "")
      .then((url) => {
        if (latest) {
          setPreview({ src: imageSrc, url });
        }
      });
    return () => {
      latest = false;
    };
  }, [imageSrc, props.note]);

  if (!editor || !marker || !imageElement) {
    return null;
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} style={{ zIndex: 3001 }}>
      <DialogTitle>{t("edit-image-dialog/title")}</DialogTitle>
      <DialogContent style={{ width: "400px", maxWidth: "100%" }}>
        <ImageWrapper>
          <ImagePreview
            // Nothing until the source in the field has been looked up,
            // rather than the image looked up before it.
            src={preview.src === imageSrc ? preview.url : ""}
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
        <Button variant={"contained"} color={"primary"} onClick={updateImage}>
          {t("general/update")}
        </Button>
        <Button variant={"contained"} color={"secondary"} onClick={deleteImage}>
          {t("general/Delete")}
        </Button>
        <Button onClick={props.onClose}> {t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
