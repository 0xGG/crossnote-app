import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@material-ui/core";
import { TabNode } from "flexlayout-react";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";

interface Props {
  open: boolean;
  onClose: () => void;
  tabNode: TabNode;
  note: Note;
}

export default function ChangeFilePathDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const note = props.note;
  const tabNode = props.tabNode;
  const [inputEl, setInputEl] = useState<HTMLInputElement>(null);
  const [newFilePath, setNewFilePath] = useState<string>(
    (note && note.filePath) || "",
  );
  const { t } = useTranslation();

  const changeFilePath = useCallback(
    (newFilePath: string) => {
      if (!note) return;
      (async () => {
        newFilePath = newFilePath.replace(/^\/+/, "");
        if (!newFilePath.endsWith(".md")) {
          newFilePath = newFilePath + ".md";
        }
        if (note.filePath !== newFilePath) {
          try {
            await crossnoteContainer.changeNoteFilePath(
              tabNode,
              note,
              newFilePath,
            );
          } catch (error) {
            new Noty({
              type: "error",
              text: t("error/failed-to-change-file-path"),
              layout: "topRight",
              theme: "relax",
              timeout: 5000,
            }).show();
          }
        }
        props.onClose();
      })();
    },
    [note, tabNode, props, t],
  );

  useEffect(() => {
    return () => {
      setInputEl(null);
    };
  }, []);

  useEffect(() => {
    if (note) {
      setNewFilePath(note.filePath);
    }
  }, [note, props.open]);

  useEffect(() => {
    if (!inputEl) return;
    inputEl.focus();
    if (inputEl.setSelectionRange) {
      const start = inputEl.value.lastIndexOf("/") + 1;
      let end = inputEl.value.lastIndexOf(".md");
      if (end < 0) {
        end = inputEl.value.length;
      }
      inputEl.setSelectionRange(start, end);
    }
  }, [inputEl]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/change-file-path")}</DialogTitle>
      <DialogContent style={{ width: "400px", maxWidth: "100%" }}>
        <TextField
          value={newFilePath}
          autoFocus={true}
          onChange={(event) => setNewFilePath(event.target.value)}
          onKeyUp={(event) => {
            if (event.which === 13) {
              changeFilePath(newFilePath);
            }
          }}
          inputRef={(input: HTMLInputElement) => {
            setInputEl(input);
          }}
          fullWidth={true}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={() => changeFilePath(newFilePath)}
        >
          {t("general/Save")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
