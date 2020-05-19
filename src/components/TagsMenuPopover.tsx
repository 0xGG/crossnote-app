import React, { useState, useCallback, useEffect } from "react";
import {
  Popover,
  List,
  ListItem,
  TextField,
  Box,
  Typography,
  IconButton,
} from "@material-ui/core";
import { Close } from "mdi-material-ui";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TagNode } from "../lib/crossnote";
import { CrossnoteContainer } from "../containers/crossnote";
import { Autocomplete } from "@material-ui/lab";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    menuItemOverride: {
      "cursor": "default",
      "padding": `0 0 0 ${theme.spacing(2)}px`,
      "&:hover": {
        backgroundColor: "inherit",
      },
    },
    menuItemTextField: {
      paddingRight: theme.spacing(2),
    },
  }),
);
interface Props {
  anchorElement: HTMLElement;
  onClose: () => void;
  addTag: (tagName: string) => void;
  deleteTag: (tagName: string) => void;
  tagNames: string[];
}
export function TagsMenuPopover(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [tagName, setTagName] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const crossnoteContainer = CrossnoteContainer.useContainer();

  const addTag = useCallback(
    (tagName: string) => {
      if (!tagName || tagName.trim().length === 0) {
        return;
      }
      props.addTag(tagName);
      setTagName("");
    },
    [props],
  );

  useEffect(() => {
    setTagName("");
  }, [props.anchorElement]);

  useEffect(() => {
    if (!props.anchorElement) {
      return;
    }
    let options: string[] = [];
    const helper = (children: TagNode[]) => {
      if (!children || !children.length) {
        return;
      }
      for (let i = 0; i < children.length; i++) {
        const tag = children[i].path;
        options.push(tag);
        helper(children[i].children);
      }
    };
    helper(crossnoteContainer.notebookTagNode.children);
    setOptions(options);
  }, [crossnoteContainer.notebookTagNode, props]);

  return (
    <Popover
      open={Boolean(props.anchorElement)}
      anchorEl={props.anchorElement}
      keepMounted
      onClose={props.onClose}
    >
      <List>
        <ListItem
          className={clsx(classes.menuItemOverride, classes.menuItemTextField)}
        >
          <Autocomplete
            inputValue={tagName}
            onInputChange={(event, newInputValue) => {
              setTagName(newInputValue);
            }}
            options={options}
            style={{ width: 300, maxWidth: "100%" }}
            value={""}
            onChange={(event: any, newValue: string) => {
              addTag(newValue);
            }}
            renderInput={(params) => (
              <TextField
                placeholder={t("general/add-a-tag")}
                fullWidth={true}
                autoFocus={true}
                onKeyUp={(event) => {
                  if (event.which === 13) {
                    addTag(tagName);
                  }
                }}
                {...params}
              ></TextField>
            )}
          ></Autocomplete>
        </ListItem>
        {props.tagNames.length > 0 ? (
          props.tagNames.map((tagName) => {
            return (
              <ListItem
                key={tagName}
                className={clsx(classes.menuItemOverride)}
              >
                <Box
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <Typography>{tagName}</Typography>
                  <IconButton onClick={() => props.deleteTag(tagName)}>
                    <Close></Close>
                  </IconButton>
                </Box>
              </ListItem>
            );
          })
        ) : (
          <ListItem className={clsx(classes.menuItemOverride)}>
            <Typography style={{ margin: "8px 0" }}>
              {t("general/no-tags")}
            </Typography>
          </ListItem>
        )}
      </List>
    </Popover>
  );
}
