import {
  Avatar,
  Box,
  ButtonBase,
  Tooltip,
  Typography,
  useTheme,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import { Star, StarOutline } from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import { NotebookFieldsFragment } from "../generated/graphql";
import { resolveNotebookFilePath } from "../utilities/image";
import {
  generateSummaryFromMarkdown,
  getHeaderFromMarkdown,
  Summary,
} from "../utilities/note";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notebookCard: {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      padding: theme.spacing(2, 0.5, 0),
      textAlign: "left",
      cursor: "default",
      backgroundColor: theme.palette.background.paper,
    },
    selected: {
      borderLeft: `4px solid ${theme.palette.primary.main}`,
    },
    unselected: {
      borderLeft: `4px solid rgba(0, 0, 0, 0)`,
    },
    leftPanel: {
      width: "48px",
      paddingLeft: theme.spacing(0.5),
    },
    rightPanel: {
      width: "calc(100% - 48px)",
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    bottomPanel: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      color: theme.palette.text.secondary,
    },
    avatar: {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
    },
    header: {
      marginBottom: theme.spacing(1),
      wordBreak: "break-all",
    },
    summary: {
      "color": theme.palette.text.secondary,
      "marginBottom": theme.spacing(1),
      "paddingRight": theme.spacing(2),
      "display": "-webkit-box",
      "lineHeight": "1.3rem !important",
      "textOverflow": "ellipsis !important",
      "overflow": "hidden !important",
      "maxWidth": "100%",
      "maxHeight": "2.6rem", // lineHeight x -website-line-clamp
      "-webkit-line-clamp": 2,
      "-webkit-box-orient": "vertical",
      "wordBreak": "break-all",
    },
    images: {
      display: "flex",
      width: "100%",
      overflow: "hidden",
      position: "relative",
      marginBottom: theme.spacing(1),
    },
    imagesWrapper: {
      display: "flex",
      alignItems: "center",
      flexDirection: "row",
    },
    image: {
      width: "128px",
      height: "80px",
      marginRight: theme.spacing(1),
      position: "relative",
      backgroundSize: "cover",
      backgroundPosition: "center",
      display: "block",
      borderRadius: "6px",
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
export function NotebookCard(props: Props) {
  const theme = useTheme();
  const classes = useStyles(props);
  const { t } = useTranslation();
  const cloudContainer = CloudContainer.useContainer();
  const notebook = props.notebook;
  const [header, setHeader] = useState<string>("");
  const [summary, setSummary] = useState<Summary>(null);
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    setHeader(getHeaderFromMarkdown(notebook.markdown));
    generateSummaryFromMarkdown(
      notebook.markdown.trim() || t("general/this-notebook-is-empty"),
    )
      .then((summary) => {
        setSummary(summary);

        // render images
        setImages(
          summary.images
            .map((image) => resolveNotebookFilePath(notebook, image))
            .filter((x) => x.length > 0)
            .slice(0, 3) || [],
        );
      })
      .catch((error) => {});
  }, [notebook, t]);

  return (
    <ButtonBase
      className={clsx(
        classes.notebookCard,
        cloudContainer.selectedNotebook &&
          cloudContainer.selectedNotebook.id === notebook.id
          ? classes.selected
          : classes.unselected,
      )}
      onClick={() => {
        cloudContainer.setSelectedNotebook(notebook);
        cloudContainer.setDisplayNotebookPreview(true);
      }}
    >
      <Box className={clsx(classes.leftPanel)}>
        <Tooltip title={notebook.owner.username}>
          <Avatar
            className={clsx(classes.avatar)}
            variant={"rounded"}
            src={
              notebook.owner.avatar ||
              "data:image/png;base64," +
                new Identicon(sha256(notebook.owner.username), 80).toString()
            }
          ></Avatar>
        </Tooltip>
      </Box>
      <Box className={clsx(classes.rightPanel)}>
        {header && (
          <Typography
            style={{ fontWeight: "bold" }}
            variant={"body1"}
            className={clsx(classes.header)}
          >
            {header}
          </Typography>
        )}
        {summary && summary.summary.trim().length > 0 && (
          <Typography className={clsx(classes.summary)}>
            {summary && summary.summary}
          </Typography>
        )}
        {images.length > 0 && (
          <Box className={clsx(classes.images)}>
            <Box className={clsx(classes.imagesWrapper)}>
              {images.map((image) => (
                <div
                  key={image}
                  className={clsx(classes.image)}
                  style={{
                    backgroundImage: `url(${image})`,
                  }}
                ></div>
              ))}
            </Box>
          </Box>
        )}
        <Box className={clsx(classes.bottomPanel)}>
          {notebook.isStarred ? (
            <Star className={clsx(classes.star)}></Star>
          ) : (
            <StarOutline
              className={clsx(classes.star)}
              style={{ color: theme.palette.text.secondary }}
            ></StarOutline>
          )}
          {" " + notebook.starsCount}
        </Box>
      </Box>
    </ButtonBase>
  );
}
