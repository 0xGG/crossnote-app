import { renderPreview } from "@0xgg/echomd/preview";
import {
  Box,
  Button,
  ButtonGroup,
  Hidden,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import {
  BookOpenPageVariant,
  ChevronLeft,
  CloudDownloadOutline,
  Cog,
  Git,
  Star,
  StarOutline,
} from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  NotebookFieldsFragment,
  useStarNotebookMutation,
  useUnstarNotebookMutation,
} from "../generated/graphql";
import { browserHistory } from "../utilities/history";
import { resolveNotebookFilePath } from "../utilities/image";
import { matter } from "../utilities/markdown";
import AddNotebookDialog from "./AddNotebookDialog";
import ConfigurePublishedNotebookDialog from "./ConfigurePublishedNotebookDialog";

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
  const [addNotebookDialogOpen, setAddNotebookDialogOpen] = useState<boolean>(
    false,
  );
  const [
    configureNotebookDialogOpen,
    setConfigureNotebookDialogOpen,
  ] = useState<boolean>(false);
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const [
    resStarNotebook,
    executeStarNotebookMutation,
  ] = useStarNotebookMutation();
  const [
    resUnstarNotebook,
    executeUnstarNotebookMutation,
  ] = useUnstarNotebookMutation();

  const openGitURLWithBranch = useCallback(() => {
    if (!notebook) {
      return;
    }
    const { gitURL, gitBranch } = notebook;
    const gitURLArr = gitURL.replace("https://", "").split("/");
    const gitHost = gitURLArr[0].toLowerCase();
    const gitOwner = gitURLArr[1];
    const gitRepo = gitURLArr[2].replace(/\.git$/, "");
    let url = "";
    if (gitHost === "github.com") {
      url = `https://github.com/${gitOwner}/${gitRepo}/tree/${gitBranch}`;
    } else if (gitHost === "gitlab.com") {
      url = `https://gitlab.com/${gitOwner}/${gitRepo}/-/tree/${gitBranch}`;
    } else if (gitHost === "gitee.com") {
      url = `https://gitee.com/${gitOwner}/${gitRepo}/tree/${gitBranch}`;
    } else if (gitHost === "gitea.com") {
      url = `https://gitea.com/${gitOwner}/${gitRepo}/src/branch/${gitBranch}`;
    }
    if (url.length) {
      window.open(url, "_blank");
    }
  }, [notebook]);

  const starOrUnstarTheNotebook = useCallback(() => {
    if (!notebook) {
      return;
    }
    if (!cloudContainer.loggedIn) {
      cloudContainer.setAuthDialogOpen(true);
      return;
    }
    const starred = notebook.isStarred;
    notebook.isStarred = !notebook.isStarred;
    if (starred) {
      notebook.starsCount = Math.max(0, notebook.starsCount - 1);
      executeUnstarNotebookMutation({
        notebookID: notebook.id,
      });
    } else {
      notebook.starsCount += 1;
      executeStarNotebookMutation({
        notebookID: notebook.id,
      });
    }
    setForceUpdate(Date.now());
  }, [
    notebook,
    executeStarNotebookMutation,
    executeUnstarNotebookMutation,
    cloudContainer.loggedIn,
  ]);

  const openNotebook = useCallback(() => {
    if (!notebook || !crossnoteContainer.notebooks.length) {
      return;
    }
    const nb = crossnoteContainer.notebooks.find(
      (n) => n.gitURL === notebook.gitURL && n.gitBranch === notebook.gitBranch,
    );
    if (nb) {
      // TODO: Fix this
      // crossnoteContainer.setSelectedNotebook(nb);
    }
  }, [notebook, crossnoteContainer.notebooks]);

  useEffect(() => {
    return () => {
      setPreviewElement(null);
    };
  }, []);

  useEffect(() => {
    if (!notebook || !previewElement) {
      return;
    }
    const handleLinksClickEvent = (preview: HTMLElement) => {
      // Handle link click event
      const links = preview.getElementsByTagName("A");
      for (let i = 0; i < links.length; i++) {
        const link = links[i] as HTMLAnchorElement;
        link.onclick = (event) => {
          event.preventDefault();
          const href = link.getAttribute("href");
          if (!href.match(/^(https?|data):/)) {
            const alreadyDownloaded = !!crossnoteContainer.notebooks.find(
              (nb) =>
                nb.gitURL === notebook.gitURL &&
                nb.gitBranch === notebook.gitBranch,
            );
            if (alreadyDownloaded) {
              const filePath = href.replace(/^\/+/, "").replace(/^\.\/+/, "");
              browserHistory.push(
                `/?repo=${encodeURIComponent(
                  notebook.gitURL,
                )}&branch=${encodeURIComponent(
                  notebook.gitBranch || "master",
                )}&filePath=${encodeURIComponent(filePath)}`,
              );
            } else {
              setAddNotebookDialogOpen(true);
            }
          } else {
            const url = resolveNotebookFilePath(notebook, href);
            if (url.startsWith("https://") || url.startsWith("http://")) {
              window.open(url, "_blank");
            }
          }
        };
      }
    };
    const resolveImages = (preview: HTMLElement) => {
      const images = preview.getElementsByTagName("IMG");
      for (let i = 0; i < images.length; i++) {
        const image = images[i] as HTMLImageElement;
        const imageSrc = image.getAttribute("src");
        image.setAttribute("src", resolveNotebookFilePath(notebook, imageSrc));
      }
    };
    renderPreview(previewElement, notebook.markdown);
    if (
      previewElement.childElementCount &&
      previewElement.children[0].tagName.toUpperCase() === "IFRAME"
    ) {
      // presentation
      previewElement.style.maxWidth = "100%";
      previewElement.style.height = "100%";
      previewElement.style.overflow = "hidden !important";
      handleLinksClickEvent(
        (previewElement.children[0] as HTMLIFrameElement).contentDocument
          .body as HTMLElement,
      );
      resolveImages(
        (previewElement.children[0] as HTMLIFrameElement).contentDocument
          .body as HTMLElement,
      );
      setPreviewIsPresentation(true);
    } else {
      // normal
      // previewElement.style.maxWidth = `${EditorPreviewMaxWidth}px`;
      previewElement.style.height = "100%";
      previewElement.style.overflow = "hidden !important";
      handleLinksClickEvent(previewElement);
      resolveImages(previewElement);
      setPreviewIsPresentation(false);
    }
  }, [notebook, previewElement, crossnoteContainer.notebooks]);

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
            <Button
              className={clsx(classes.controlBtn)}
              onClick={starOrUnstarTheNotebook}
            >
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
              <Button
                className={clsx(classes.controlBtn)}
                onClick={openNotebook}
              >
                <BookOpenPageVariant
                  style={{ marginRight: theme.spacing(0.5) }}
                ></BookOpenPageVariant>
                {t("general/Open")}
              </Button>
            </ButtonGroup>
          ) : (
            <ButtonGroup style={{ marginLeft: theme.spacing(1) }}>
              <Button
                className={clsx(classes.controlBtn)}
                disabled={crossnoteContainer.isAddingNotebook}
                onClick={() => setAddNotebookDialogOpen(true)}
              >
                <CloudDownloadOutline
                  style={{ marginRight: theme.spacing(0.5) }}
                ></CloudDownloadOutline>
                {t("general/Download")}
              </Button>
            </ButtonGroup>
          )}
          {cloudContainer.viewer &&
            cloudContainer.viewer.username === notebook.owner.username && (
              <ButtonGroup style={{ marginLeft: theme.spacing(1) }}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => setConfigureNotebookDialogOpen(true)}
                >
                  <Cog></Cog>
                  {t("general/Configure")}
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
            onClick={openGitURLWithBranch}
          >{`${notebook.gitURL}:${notebook.gitBranch}`}</Typography>
        </Box>
      </Box>
      <AddNotebookDialog
        open={addNotebookDialogOpen}
        onClose={() => setAddNotebookDialogOpen(false)}
        gitURL={notebook.gitURL}
        gitBranch={notebook.gitBranch}
        notebookName={matter(notebook.markdown).data?.notebook?.name || ""}
        canCancel={true}
      ></AddNotebookDialog>
      <ConfigurePublishedNotebookDialog
        notebook={notebook}
        open={configureNotebookDialogOpen}
        onClose={() => setConfigureNotebookDialogOpen(false)}
      ></ConfigurePublishedNotebookDialog>
    </Box>
  );
}
