import React, { useState, useEffect, FC } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Typography, ButtonBase, Tooltip, Card } from "@material-ui/core";
import { generateSummaryFromMarkdown, Summary } from "../utilities/note";
import { formatDistanceStrict } from "date-fns/esm";
import { useTranslation } from "react-i18next";
import { Pin } from "mdi-material-ui";
import { formatRelative } from "date-fns";
import { basename } from "path";
import { SettingsContainer } from "../containers/settings";
import { languageCodeToDateFNSLocale } from "../i18n/i18n";
import { resolveNoteImageSrc } from "../utilities/image";
import { Note } from "../lib/notebook";

export const NoteCardWidth = 550;
export const NoteCardMargin = 4;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    noteCard: {
      width: `${NoteCardWidth}px`,
      maxWidth: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      padding: theme.spacing(2, 0.5, 0),
      textAlign: "left",
      cursor: "pointer",
      backgroundColor: theme.palette.background.paper,
      margin: `${NoteCardMargin}px auto`,
      [theme.breakpoints.down("sm")]: {
        marginLeft: 0,
        marginRight: 0,
      },
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
    duration: {
      color: theme.palette.text.secondary,
    },
    rightPanel: {
      width: "calc(100% - 48px)",
      borderBottom: `1px solid ${theme.palette.divider}`,
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
    filePath: {
      wordBreak: "break-all",
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
    pin: {
      color: theme.palette.secondary.main,
      marginTop: theme.spacing(1),
    },
  }),
);

interface Props {
  note: Note;
}

export default function NoteCard(props: Props) {
  const classes = useStyles(props);
  const note = props.note;
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
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
    setHeader(note.title);
    generateSummaryFromMarkdown(
      note.config.encryption
        ? `🔐 ${t("general/encrypted")}`
        : note.markdown.trim() || t("general/this-note-is-empty"),
    )
      .then((summary) => {
        setSummary(summary);

        // render images
        const imagePromises = Promise.all(
          summary.images.map((image) => resolveNoteImageSrc(note, image)),
        );
        imagePromises
          .then((imageSrcs) => {
            imageSrcs = imageSrcs.filter((x) => x).slice(0, 3);
            setImages(imageSrcs || []);
          })
          .catch((error) => {
            setImages([]);
          });
      })
      .catch((error) => {});
  }, [
    note.markdown,
    note.config.encryption,
    note,
    crossnoteContainer.crossnote,
    t,
  ]);

  /*
  useEffect(() => {
    crossnoteContainer.crossnote
      .getStatus(note.notebook, note.filePath)
      .then((status) => {
        setGitStatus(status);
      });
  }, [
    note.markdown,
    note.config.modifiedAt,
    note,
    crossnoteContainer.crossnote,
  ]);*/

  return (
    <Card
      className={clsx(classes.noteCard, "note-card")}
      onClick={() => {
        // crossnoteContainer.setDisplayMobileEditor(true);
        crossnoteContainer.addTabNode({
          type: "tab",
          component: "Note",
          config: {
            singleton: false,
            note,
          },
          name: `📝 ` + note.title,
        });
      }}
    >
      <Box className={clsx(classes.leftPanel)}>
        <Tooltip
          title={
            <>
              <p>
                {t("general/created-at") +
                  " " +
                  formatRelative(new Date(note.config.createdAt), new Date(), {
                    locale: languageCodeToDateFNSLocale(
                      settingsContainer.language,
                    ),
                  })}
              </p>
              <p>
                {t("general/modified-at") +
                  " " +
                  formatRelative(new Date(note.config.modifiedAt), new Date(), {
                    locale: languageCodeToDateFNSLocale(
                      settingsContainer.language,
                    ),
                  })}
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
            {summary && summary.summary.slice(0, 200)}
          </Typography>
        )}
        {images.length > 0 && (
          <Box className={clsx(classes.images)}>
            <Box className={clsx(classes.imagesWrapper)}>
              {images.map((image, offset) => (
                <div
                  key={`${image}-${offset}`}
                  className={clsx(classes.image)}
                  style={{
                    backgroundImage: `url(${image})`,
                  }}
                ></div>
              ))}
            </Box>
          </Box>
        )}
        <Typography variant={"caption"} className={clsx(classes.filePath)}>
          {t(`git/status/${gitStatus}`)}
        </Typography>
      </Box>
    </Card>
  );
}
