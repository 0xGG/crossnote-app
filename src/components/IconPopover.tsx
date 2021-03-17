import { Popover } from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import { Picker as EmojiPicker } from "emoji-mart";
import { TabNode } from "flexlayout-react";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    secondaryColor: {
      color: theme.palette.secondary.main,
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
  }),
);

interface Props {
  tabNode: TabNode;
  note: Note;
  anchorElement: Element;
  onClose: () => void;
}

export default function IconPopover(props: Props) {
  const classes = useStyles(props);
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
        emoji={""}
        set={"twitter"}
        showSkinTones={false}
        onSelect={(data) => {
          console.log("Selected ", data);
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
