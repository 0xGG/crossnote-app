import React, { useState, useEffect } from "react";
import {
  Box,
  Hidden,
  ButtonGroup,
  Button,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { NotebookFieldsFragment } from "../generated/graphql";
import { CloudContainer } from "../containers/cloud";
import {
  ChevronLeft,
  Git,
  Star,
  StarOutline,
  CloudDownloadOutline,
  Cog,
  BookOpenPageVariant,
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { renderPreview } from "vickymd/preview";
import { CrossnoteContainer } from "../containers/crossnote";

const previewZIndex = 99;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notebookPanel: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      borderRadius: 0,
    },
    topPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1), // theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      // borderBottom: "1px solid #eee",
      overflow: "auto",
      backgroundColor: theme.palette.background.paper,
    },
    bottomPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.palette.background.paper,
      // borderTop: "1px solid #eee",
      // color: theme.palette.primary.contrastText,
      // backgroundColor: theme.palette.primary.main
    },
    controlBtn: {
      padding: theme.spacing(0.5, 1.5),
      color: theme.palette.text.secondary,
    },
    controlBtnSelected: {
      color: theme.palette.primary.main,
    },
    controlBtnSelectedSecondary: {
      color: theme.palette.secondary.main,
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    backBtn: {
      marginRight: "8px",
      [theme.breakpoints.up("sm")]: {
        display: "none",
      },
    },
    previewWrapper: {
      flex: 1,
      overflow: "auto",
      backgroundColor: theme.palette.background.paper,
    },
    preview: {
      position: "relative",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      border: "none",
      overflow: "auto !important",
      padding: theme.spacing(2),
      zIndex: previewZIndex,
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
      // gridArea: "2 / 2 / 3 / 3"
    },
    presentation: {
      padding: "0 !important",
    },
    star: {
      color: theme.palette.secondary.main,
      marginRight: theme.spacing(0.5),
    },
  }),
);

interface Props {
  notebook: NotebookFieldsFragment;
}

export function NotebookPanel(props: Props) {
  const classes = useStyles(props);
  const theme = useTheme();
  const { t } = useTranslation();
  const notebook = props.notebook;
  const cloudContainer = CloudContainer.useContainer();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [previewIsPresentation, setPreviewIsPresentation] = useState<boolean>(
    false,
  );
  const [alreadyDownloadedNotebook, setAlreadyDownloadedNotebook] = useState<
    boolean
  >(false);

  useEffect(() => {
    return () => {
      setPreviewElement(null);
    };
  }, []);

  useEffect(() => {
    if (!notebook || !previewElement) {
      return;
    }
    renderPreview(previewElement, notebook.markdown);
    if (
      previewElement.childElementCount &&
      previewElement.children[0].tagName.toUpperCase() === "IFRAME"
    ) {
      // presentation
      previewElement.style.maxWidth = "100%";
      previewElement.style.height = "100%";
      previewElement.style.overflow = "hidden !important";
      /*handleLinksClickEvent(
        (previewElement.children[0] as HTMLIFrameElement).contentDocument
          .body as HTMLElement,
      );
      resolveImages(
        (previewElement.children[0] as HTMLIFrameElement).contentDocument
          .body as HTMLElement,
      );*/
      setPreviewIsPresentation(true);
    } else {
      // normal
      // previewElement.style.maxWidth = `${EditorPreviewMaxWidth}px`;
      previewElement.style.height = "100%";
      previewElement.style.overflow = "hidden !important";
      /*
      handleLinksClickEvent(previewElement);
      resolveImages(previewElement);
      */
      setPreviewIsPresentation(false);
    }
  }, [notebook, previewElement]);

  useEffect(() => {
    if (!notebook) {
      setAlreadyDownloadedNotebook(false);
    } else {
      const index = crossnoteContainer.notebooks.findIndex(
        (n) =>
          n.gitURL === notebook.gitURL && n.gitBranch === notebook.gitBranch,
      );
      setAlreadyDownloadedNotebook(index >= 0);
    }
  }, [notebook, crossnoteContainer.notebooks]);

  if (!notebook) {
    return (
      <Box className={clsx(classes.notebookPanel)}>
        <Hidden smUp>
          <Box className={clsx(classes.topPanel)}>
            <Box className={clsx(classes.row)}>
              <ButtonGroup className={clsx(classes.backBtn)}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => {
                    cloudContainer.setDisplayNotebookPreview(false);
                  }}
                >
                  <ChevronLeft></ChevronLeft>
                </Button>
              </ButtonGroup>
            </Box>
          </Box>
        </Hidden>
        <Box
          style={{
            margin: "0 auto",
            top: "50%",
            position: "relative",
          }}
        >
          <Typography>{`📒 ${t("general/nothing-here")}`}</Typography>
        </Box>
      </Box>
    );
  }
  return (
    <Box className={clsx(classes.notebookPanel)}>
      <Box className={clsx(classes.topPanel, "editor-toolbar")}>
        <Box className={clsx(classes.row)}>
          <ButtonGroup className={clsx(classes.backBtn)}>
            <Button
              className={clsx(classes.controlBtn)}
              onClick={() => {
                cloudContainer.setDisplayNotebookPreview(false);
              }}
            >
              <ChevronLeft></ChevronLeft>
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button className={clsx(classes.controlBtn)}>
              {notebook.isStarred ? (
                <Star className={clsx(classes.star)}></Star>
              ) : (
                <StarOutline
                  className={clsx(classes.star)}
                  style={{ color: theme.palette.text.secondary }}
                ></StarOutline>
              )}
              {notebook.starsCount}
            </Button>
          </ButtonGroup>
          {alreadyDownloadedNotebook ? (
            <ButtonGroup style={{ marginLeft: theme.spacing(1) }}>
              <Button className={clsx(classes.controlBtn)}>
                <BookOpenPageVariant
                  style={{ marginRight: theme.spacing(0.5) }}
                ></BookOpenPageVariant>
                {"Open"}
              </Button>
            </ButtonGroup>
          ) : (
            <ButtonGroup style={{ marginLeft: theme.spacing(1) }}>
              <Button className={clsx(classes.controlBtn)}>
                <CloudDownloadOutline
                  style={{ marginRight: theme.spacing(0.5) }}
                ></CloudDownloadOutline>
                {"Download"}
              </Button>
            </ButtonGroup>
          )}
          {cloudContainer.viewer &&
            cloudContainer.viewer.username === notebook.owner.username && (
              <ButtonGroup style={{ marginLeft: theme.spacing(1) }}>
                <Button className={clsx(classes.controlBtn)}>
                  <Cog></Cog>
                  {t("general/Settings")}
                </Button>
              </ButtonGroup>
            )}
        </Box>
      </Box>
      <Box className={clsx(classes.previewWrapper)}>
        <div
          className={clsx(
            classes.preview,
            "preview",
            previewIsPresentation ? classes.presentation : null,
          )}
          ref={(element: HTMLElement) => {
            setPreviewElement(element);
          }}
        ></div>
      </Box>
      <Box className={clsx(classes.bottomPanel)}>
        <Box className={clsx(classes.row)}>
          <Git
            style={{
              color: theme.palette.text.secondary,
              marginRight: theme.spacing(0.5),
            }}
          ></Git>
          <Typography
            variant={"caption"}
            style={{ cursor: "pointer" }}
            color={"textPrimary"}
          >{`${notebook.gitURL}:${notebook.gitBranch}`}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
