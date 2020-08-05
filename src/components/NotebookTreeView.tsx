import { TreeView, TreeItem } from "@material-ui/lab";
import {
  createStyles,
  makeStyles,
  Theme,
  darken,
  fade,
} from "@material-ui/core/styles";
import clsx from "clsx";
import React, { useState, useCallback, useEffect } from "react";
import { IconButton, Box, Typography } from "@material-ui/core";
import { ChevronRight, ChevronDown } from "mdi-material-ui";
import {
  CrossnoteContainer,
  SelectedSectionType,
  HomeSection,
} from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import { Notebook } from "../lib/notebook";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    treeItemRoot: {
      "paddingLeft": "4px",
      // color: theme.palette.text.secondary,
      "&:focus > $treeItemContent": {
        color: theme.palette.text.primary,
        backgroundColor: darken(theme.palette.background.paper, 0.05),
      },
      "&:focus > $treeItemLabelIcon": {
        color: theme.palette.text.primary,
      },
    },
    treeItemContent: {
      "cursor": "default",
      "color": theme.palette.text.primary,
      // paddingLeft: theme.spacing(1),
      // paddingRight: theme.spacing(1),
      "userSelect": "none",
      "fontWeight": theme.typography.fontWeightMedium,
      "$treeItemExpanded > &": {
        fontWeight: theme.typography.fontWeightRegular,
      },
    },
    treeItemGroup: {
      "marginLeft": 0,
      "& $treeItemContent": {
        // paddingLeft: theme.spacing(2)
      },
    },
    treeItemExpanded: {},
    treeItemLabel: {
      fontWeight: "inherit",
      color: "inherit",
      backgroundColor: "transparent !important",
    },
    treeItemLabelRoot: {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(1, 0),
    },
    treeItemLabelIcon: {},
    treeItemLabelText: {
      paddingLeft: "12px",
      flexGrow: 1,
    },
  }),
);

interface Props {
  notebook: Notebook;
}
export default function NotebookTreeView(props: Props) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState<string[]>([]);
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { t } = useTranslation();

  useEffect(() => {
    if (crossnoteContainer.homeSection !== HomeSection.Notebooks) {
      setExpanded([]);
    }
  }, [crossnoteContainer.homeSection]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<{}>, nodes: string[]) => {
      event.stopPropagation();
      const element = event.target as HTMLElement;
      if (
        element &&
        element.tagName &&
        element.tagName.toUpperCase().match(/^(SVG|PATH|BUTTON)$/)
      ) {
        console.log("set selected notebook");
        crossnoteContainer.setSelectedNotebook(props.notebook);
        setExpanded(nodes);
      }
    },
    [props.notebook],
  );

  useEffect(() => {
    if (crossnoteContainer.selectedNotebook !== props.notebook) {
      setExpanded([]);
    }
  }, [crossnoteContainer.selectedNotebook, props.notebook]);

  return (
    <TreeView
      defaultExpandIcon={
        <IconButton
          disableFocusRipple={true}
          disableRipple={true}
          size={"medium"}
        >
          <ChevronRight></ChevronRight>
        </IconButton>
      }
      defaultCollapseIcon={
        <IconButton
          disableFocusRipple={true}
          disableRipple={true}
          size={"medium"}
        >
          <ChevronDown></ChevronDown>
        </IconButton>
      }
      defaultEndIcon={<div style={{ width: 24 }} />}
      expanded={expanded}
      onNodeToggle={handleChange}
      style={{ width: "100%" }}
    >
      <TreeItem
        nodeId={"notes"}
        classes={{
          root: classes.treeItemRoot,
          content: classes.treeItemContent,
          expanded: classes.treeItemExpanded,
          group: classes.treeItemGroup,
          label: classes.treeItemLabel,
        }}
        label={
          <Box
            onClick={() => {
              crossnoteContainer.setSelectedNotebook(props.notebook);
            }}
            className={clsx(classes.treeItemLabelRoot)}
          >
            <Typography
              color={"inherit"}
              variant={"body1"}
              className={clsx(classes.treeItemLabelText)}
            >
              {props.notebook.name +
                (props.notebook.localSha === props.notebook.remoteSha
                  ? ""
                  : " 🔔")}
            </Typography>
          </Box>
        }
      >
        <TreeItem
          nodeId={"today-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Today",
                  id: "Today:" + props.notebook.dir,
                  name: t("general/today"),
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="today-notes">
                {"📅"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/today")}
              </Typography>
            </Box>
          }
        ></TreeItem>
        <TreeItem
          nodeId={"todo-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Todo",
                  id: "Todo: " + props.notebook.dir,
                  name: t("general/todo"),
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="todo-notes">
                {"☑️"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/todo")}
              </Typography>
            </Box>
          }
        ></TreeItem>
        <TreeItem
          nodeId={"directories"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Notes",
                  id: "Notes: " + props.notebook.dir,
                  name: "📔 " + props.notebook.name,
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="directories">
                {"📔"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/notes")}
              </Typography>
            </Box>
          }
        ></TreeItem>
        <TreeItem
          nodeId={"conflicted-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Conflicted",
                  id: "Conflicted: " + props.notebook.dir,
                  name: t("general/conflicted"),
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="conflicted-notes">
                {"⚠️"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/conflicted")}
              </Typography>
            </Box>
          }
        ></TreeItem>
      </TreeItem>
    </TreeView>
  );
}
