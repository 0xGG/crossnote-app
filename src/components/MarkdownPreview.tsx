import { renderPreview } from "@0xgg/echomd/preview";
import { styled } from "@mui/material/styles";
import { useCallback, useEffect, useState } from "react";
import { Note } from "../lib/note";
import { postprocessPreview as previewPostprocessPreview } from "../utilities/preview";

interface Props {
  note: Note;
  markdown: string;
}

const previewZIndex = 99;
const Preview = styled("div")(({ theme }) => ({
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
  [theme.breakpoints.down("md")]: {
    padding: theme.spacing(1),
  },
}));

export default function MarkdownPreview(props: Props) {
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
        previewElement.innerText = String(error);
      }
    }
  }, [props.markdown, props.note, previewElement, postprocessPreview]);

  return (
    <Preview
      className={"preview"}
      ref={(element: HTMLElement) => {
        setPreviewElement(element);
      }}
    ></Preview>
  );
}
