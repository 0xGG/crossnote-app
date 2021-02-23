import { renderPreview } from "@0xgg/echomd/preview";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { Note } from "../lib/note";
import { postprocessPreview as previewPostprocessPreview } from "../utilities/preview";

interface Props {
  note: Note;
  markdown: string;
}

const previewZIndex = 99;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    preview: {
      position: "relative",
      left: "0",
      top: "0",
      width: "800px",
      maxWidth: "100%",
      margin: "0 auto",
      height: "100%",
      border: "none",
      overflow: "auto !important",
      paddingLeft: theme.spacing(1),
      paddingRight: theme.spacing(1),
      // padding: theme.spacing(1, 2),
      zIndex: previewZIndex,
      backgroundColor: "inherit !important",
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
    },
  }),
);

export default function MarkdownPreview(props: Props) {
  const classes = useStyles(props);
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);

  const postprocessPreview = useCallback(
    (previewElement: HTMLElement) => {
      if (props.note && previewElement) {
        previewPostprocessPreview(previewElement, props.note, (flag) => {});
      }
    },
    [props.note],
  );

  useEffect(() => {
    if (previewElement && props.markdown && props.note) {
      try {
        renderPreview(previewElement, props.markdown);
        postprocessPreview(previewElement);
      } catch (error) {
        previewElement.innerText = error;
      }
    }
  }, [props.markdown, props.note, previewElement, postprocessPreview]);

  return (
    <div
      className={clsx(classes.preview, "preview")}
      ref={(element: HTMLElement) => {
        setPreviewElement(element);
      }}
    ></div>
  );
}
