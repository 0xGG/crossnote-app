import React, { useEffect, useCallback } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Card, IconButton, Typography, Hidden } from "@material-ui/core";
import { Menu as MenuIcon } from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { renderPreview } from "vickymd/preview";
import * as path from "path";

const previewZIndex = 99;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    wikiPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    },
    topPanel: {
      padding: theme.spacing(1),
      borderRadius: "0",
    },
    row: {
      display: "flex",
      alignItems: "center",
    },
    sectionName: {
      marginLeft: theme.spacing(1),
    },
    toc: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12),
    },
    preview: {
      position: "relative",
      left: "0",
      top: "0",
      margin: "4px",
      width: "calc(100% - 8px)",
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
  }),
);

interface Props {
  toggleDrawer: () => void;
}

export default function WikiPanel(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  const openURL = useCallback(
    (url: string = "") => {
      if (!url || !crossnoteContainer.selectedNotebook) {
        return;
      }
      const notebook = crossnoteContainer.selectedNotebook;
      if (url.match(/https?:\/\//)) {
        window.open(url, "_blank");
      } else if (url.startsWith("/")) {
        let filePath = path.relative(
          notebook.dir,
          path.resolve(notebook.dir, url.replace(/^\//, "")),
        );
        crossnoteContainer.openNoteAtPath(filePath);
      } else {
        let filePath = path.relative(
          notebook.dir,
          path.resolve(notebook.dir, url),
        );
        crossnoteContainer.openNoteAtPath(filePath);
      }
    },
    [crossnoteContainer.selectedNotebook],
  );

  useEffect(() => {
    return () => {
      crossnoteContainer.setWikiTOCElement(null);
    };
  }, []);

  useEffect(() => {
    if (crossnoteContainer.wikiTOCElement) {
      crossnoteContainer
        .getNote(crossnoteContainer.selectedNotebook, "SUMMARY.md")
        .then((note) => {
          const handleLinksClickEvent = (preview: HTMLElement) => {
            // Handle link click event
            const links = preview.getElementsByTagName("A");
            for (let i = 0; i < links.length; i++) {
              const link = links[i] as HTMLAnchorElement;
              link.onclick = (event) => {
                event.preventDefault();
                openURL(link.getAttribute("href"));
              };
            }
          };
          renderPreview(crossnoteContainer.wikiTOCElement, note.markdown);
          handleLinksClickEvent(crossnoteContainer.wikiTOCElement);
        })
        .catch(() => {});
    }
  }, [crossnoteContainer.wikiTOCElement]);

  return (
    <Box className={clsx(classes.wikiPanel)}>
      <Card className={clsx(classes.topPanel)}>
        <Box className={clsx(classes.row)}>
          <Hidden smUp implementation="css">
            <IconButton onClick={props.toggleDrawer}>
              <MenuIcon></MenuIcon>
            </IconButton>
          </Hidden>
          <Box className={clsx(classes.row)}>
            <span role="img" aria-label="wiki">
              📖
            </span>
            <Typography className={clsx(classes.sectionName)}>
              {"wiki"}
            </Typography>
          </Box>
          {/*<IconButton
            onClick={() => {
              crossnoteContainer.createNewNote();
            }}
          >
            <FileEditOutline></FileEditOutline>
          </IconButton>*/}
        </Box>
      </Card>
      <div
        className={clsx(classes.toc, classes.preview, "preview")}
        ref={(element: HTMLElement) => {
          crossnoteContainer.setWikiTOCElement(element);
        }}
      ></div>
    </Box>
  );
}
