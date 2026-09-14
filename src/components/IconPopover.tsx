import { Popover } from "@mui/material";
import { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import { TabNode } from "flexlayout-react";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";
import { EmojiPicker } from "./EmojiWrapper";

const useStyles = makeStyles()((theme: Theme) => ({
  secondaryColor: {
    color: theme.palette.secondary.main,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  },
}));

interface Props {
  tabNode: TabNode;
  note: Note;
  anchorElement: Element;
  onClose: () => void;
}

export default function IconPopover(props: Props) {
  const { classes } = useStyles();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const note = props.note;

  return (
    <Popover
      anchorEl={props.anchorElement}
      keepMounted
      open={Boolean(props.anchorElement)}
      onClose={props.onClose}
    >
      <EmojiPicker
        showSkinTones={true}
        onSelect={(data) => {
          crossnoteContainer.setNoteIcon(
            props.tabNode,
            note.notebookPath,
            note.filePath,
            data.colons,
          );
          props.onClose();
        }}
      ></EmojiPicker>
    </Popover>
  );
}
