import React, { useState, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Typography, ButtonBase, Tooltip } from "@material-ui/core";
import { Note } from "../lib/crossnote";
import {
  getHeaderFromMarkdown,
  generateSummaryFromMarkdown,
  Summary
} from "../utilities/note";
import { formatDistanceStrict } from "date-fns/esm";
import { useTranslation } from "react-i18next";
import { Pin } from "mdi-material-ui";
import { formatRelative } from "date-fns";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    noteCard: {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      padding: theme.spacing(2, 0.5, 0),
      textAlign: "left",
      cursor: "default"
    },
    selected: {
      borderLeft: `4px solid ${theme.palette.primary.main}`
    },
    unselected: {
      borderLeft: `4px solid rgba(0, 0, 0, 0)`
    },
    leftPanel: {
      width: "48px",
      paddingLeft: theme.spacing(0.5)
    },
    duration: {
      color: theme.palette.text.secondary
    },
    rightPanel: {
      width: "calc(100% - 48px)",
      borderBottom: "1px solid #ededed"
    },
    header: {
      marginBottom: theme.spacing(1),
      wordBreak: "break-all"
    },
    summary: {
      color: theme.palette.text.secondary,
      marginBottom: theme.spacing(1),
      paddingRight: theme.spacing(2),
      display: "-webkit-box",
      lineHeight: "1.3rem !important",
      textOverflow: "ellipsis !important",
      overflow: "hidden !important",
      maxWidth: "100%",
      maxHeight: "2.6rem", // lineHeight x -website-line-clamp
      "-webkit-line-clamp": 2,
      "-webkit-box-orient": "vertical",
      wordBreak: "break-all"
    },
    filePath: {},
    images: {
      display: "flex",
      width: "100%",
      overflow: "hidden",
      position: "relative",
      marginBottom: theme.spacing(1)
    },
    imagesWrapper: {
      display: "flex",
      alignItems: "center",
      flexDirection: "row"
    },
    image: {
      width: "128px",
      height: "80px",
      marginRight: theme.spacing(1),
      position: "relative",
      backgroundSize: "cover",
      backgroundPosition: "center",
      display: "block",
      borderRadius: "6px"
    },
    pin: {
      color: theme.palette.secondary.main,
      marginTop: theme.spacing(1)
    }
  })
);

interface Props {
  note: Note;
}

export default function NoteCard(props: Props) {
  const classes = useStyles(props);
  const note = props.note;
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [header, setHeader] = useState<string>("");
  const [summary, setSummary] = useState<Summary>(null);
  const [images, setImages] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<string>("");
  const { t } = useTranslation();
  const duration = formatDistanceStrict(note.config.modifiedAt, Date.now())
    .replace(/\sseconds?/, "s")
    .replace(/\sminutes?/, "m")
    .replace(/\shours?/, "h")
    .replace(/\sdays?/, "d")
    .replace(/\sweeks?/, "w")
    .replace(/\smonths?/, "mo")
    .replace(/\syears?/, "y");

  useEffect(() => {
    setHeader(
      (note.config.encryption && note.config.encryption.title) ||
        getHeaderFromMarkdown(note.markdown)
    );
    generateSummaryFromMarkdown(
      note.config.encryption
        ? "🔐 encrypted"
        : note.markdown.trim() || t("general/this-note-is-empty")
    )
      .then(summary => {
        setSummary(summary);

        // render images
        const images = summary.images
          .filter(image => image.startsWith("https://"))
          .slice(0, 3); // TODO: Support local image
        setImages(images);
      })
      .catch(error => {});
  }, [note.markdown, note.config.encryption, t]);

  useEffect(() => {
    crossnoteContainer.crossnote.getStatus(note).then(status => {
      setGitStatus(status);
    });
  }, [
    note.markdown,
    note.config.modifiedAt,
    note,
    crossnoteContainer.crossnote
  ]);

  return (
    <ButtonBase
      className={clsx(
        classes.noteCard,
        crossnoteContainer.selectedNote &&
          crossnoteContainer.selectedNote.filePath === note.filePath
          ? classes.selected
          : classes.unselected
      )}
      onClick={() => {
        crossnoteContainer.setSelectedNote(note);
        crossnoteContainer.setDisplayMobileEditor(true);
      }}
    >
      <Box className={clsx(classes.leftPanel)}>
        <Tooltip
          title={
            <>
              <p>
                {t("general/created-at") +
                  " " +
                  formatRelative(
                    new Date(note.config.createdAt),
                    new Date() /*{
                    locale: languageCodeToDateFNSLocale(
                      crossnoteContainer.viewer.language
                    )
                  }*/
                  )}
              </p>
              <p>
                {t("general/modified-at") +
                  " " +
                  formatRelative(
                    new Date(note.config.modifiedAt),
                    new Date() /*{
                      locale: languageCodeToDateFNSLocale(
                        crossnoteContainer.viewer.language
                      )
                    }*/
                  )}
              </p>
            </>
          }
          arrow
        >
          <Typography className={clsx(classes.duration)}>{duration}</Typography>
        </Tooltip>

        {note.config.pinned && <Pin className={clsx(classes.pin)}></Pin>}
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
              {images.map(image => (
                <div
                  key={image}
                  className={clsx(classes.image)}
                  style={{
                    backgroundImage: `url(${image})`
                  }}
                ></div>
              ))}
            </Box>
          </Box>
        )}
        <Typography variant={"caption"} className={clsx(classes.filePath)}>
          {note.filePath + " - " + gitStatus}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
