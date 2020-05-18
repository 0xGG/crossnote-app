import React, { useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Card, IconButton, Typography, Hidden } from "@material-ui/core";
import { Menu as MenuIcon } from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { renderPreview } from "vickymd/preview";
import { postprocessPreview } from "../utilities/preview";

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
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { t } = useTranslation();

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
          renderPreview(crossnoteContainer.wikiTOCElement, note.markdown);
          postprocessPreview(crossnoteContainer.wikiTOCElement, note);
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
              {"📖"}
            </span>
            <Typography className={clsx(classes.sectionName)}>
              {t("general/wiki")}
            </Typography>
          </Box>
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
