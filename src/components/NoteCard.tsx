import { Box, IconButton, Tooltip, Typography } from "@material-ui/core";
import {
  createStyles,
  darken,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { formatRelative } from "date-fns";
import { formatDistanceStrict } from "date-fns/esm";
import { TabNode } from "flexlayout-react";
import { DotsVertical, Pin } from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { languageCodeToDateFNSLocale } from "../i18n/i18n";
import {
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
} from "../lib/event";
import { Note } from "../lib/note";
import { Reference } from "../lib/reference";
import { resolveNoteImageSrc } from "../utilities/image";
import { generateSummaryFromMarkdown, Summary } from "../utilities/note";
import NotePopover from "./NotePopover";

export const NoteCardMargin = 4;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    noteCard: {
      maxWidth: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      padding: theme.spacing(2, 0.5, 0),
      textAlign: "left",
      // backgroundColor: theme.palette.background.paper,
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
      "color": theme.palette.text.primary,
      "marginBottom": theme.spacing(1),
      "wordBreak": "break-all",
      "&:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.08),
        cursor: "pointer",
      },
      "flex": 1,
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
      "&:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.08),
        cursor: "pointer",
      },
    },
    filePath: {
      wordBreak: "break-all",
      color: theme.palette.text.primary,
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
    markdownPreview: {
      "width": "calc(100% - 32px)",
      "&:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.08),
        cursor: "pointer",
      },
    },
  }),
);

interface Props {
  tabNode: TabNode;
  note: Note;
  referredNote?: Note;
}

export default function NoteCard(props: Props) {
  const classes = useStyles(props);
  const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const [header, setHeader] = useState<string>("");
  const [summary, setSummary] = useState<Summary>(null);
  const [images, setImages] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<string>("");
  const [popoverElement, setPopoverElement] = useState<Element>(null);
  const [note, setNote] = useState<Note>(props.note);
  const [references, setReferences] = useState<Reference[]>([]);
  const { t } = useTranslation();
  const duration = formatDistanceStrict(note.config.modifiedAt, Date.now())
    .replace(/\sseconds?/, "s")
    .replace(/\sminutes?/, "m")
    .replace(/\shours?/, "h")
    .replace(/\sdays?/, "d")
    .replace(/\sweeks?/, "w")
    .replace(/\smonths?/, "mo")
    .replace(/\syears?/, "y");

  const openNote = useCallback(() => {
    if (note) {
      crossnoteContainer.addTabNode({
        type: "tab",
        component: "Note",
        config: {
          singleton: false,
          note,
          notebook: crossnoteContainer.getNotebookAtPath(note.notebookPath),
        },
        name: `📝 ` + note.title,
      });
    }
  }, [note]);

  useEffect(() => {
    setNote(props.note);
  }, [props.note]);

  useEffect(() => {
    if (!note) {
      return;
    }
    const modifiedMarkdownCallback = async (
      data: ModifiedMarkdownEventData,
    ) => {
      if (
        note.filePath === data.noteFilePath &&
        note.notebookPath === data.notebookPath
      ) {
        const newNote = await crossnoteContainer.getNote(
          data.notebookPath,
          data.noteFilePath,
        );
        setNote(newNote);
      }
    };

    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    };
  }, [note]);

  useEffect(() => {
    if (props.referredNote && note) {
      const notebook = crossnoteContainer.getNotebookAtPath(note.notebookPath);
      if (!notebook) {
        return;
      }
      setReferences(
        notebook.getReferences(props.referredNote.filePath, note.filePath) ||
          [],
      );
    }
  }, [note, props.referredNote]);

  useEffect(() => {
    setHeader(note.title);
    generateSummaryFromMarkdown(
      note.markdown.trim() || t("general/this-note-is-empty"),
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
  }, [note.markdown, note, crossnoteContainer.crossnote, t]);

  useEffect(() => {
    crossnoteContainer
      .getStatus(note.notebookPath, note.filePath)
      .then((status) => {
        setGitStatus(status);
      });
  }, [note.markdown, note.config.modifiedAt, note]);

  return (
    <React.Fragment>
      <Box className={clsx(classes.noteCard, "note-card")}>
        <Box className={clsx(classes.leftPanel)}>
          <Tooltip
            title={
              <>
                <p>
                  {t("general/created-at") +
                    " " +
                    formatRelative(
                      new Date(note.config.createdAt),
                      new Date(),
                      {
                        locale: languageCodeToDateFNSLocale(
                          settingsContainer.language,
                        ),
                      },
                    )}
                </p>
                <p>
                  {t("general/modified-at") +
                    " " +
                    formatRelative(
                      new Date(note.config.modifiedAt),
                      new Date(),
                      {
                        locale: languageCodeToDateFNSLocale(
                          settingsContainer.language,
                        ),
                      },
                    )}
                </p>
              </>
            }
            arrow
          >
            <Typography className={clsx(classes.duration)}>
              {duration}
            </Typography>
          </Tooltip>

          {note.config.pinned && <Pin className={clsx(classes.pin)}></Pin>}
        </Box>
        <Box className={clsx(classes.rightPanel)}>
          <Box
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <Typography
              style={{ fontWeight: "bold", marginBottom: "0" }}
              variant={"body1"}
              className={clsx(classes.header)}
              onClick={openNote}
            >
              {header}
            </Typography>
            <Box style={{ display: "flex", alignItems: "center" }}>
              {props.referredNote && (
                <Typography
                  variant={"subtitle2"}
                  style={{
                    marginLeft: theme.spacing(1),
                    marginRight: theme.spacing(1),
                  }}
                  color={"textPrimary"}
                >
                  {references.length} reference(s)
                </Typography>
              )}
              <IconButton
                size={"small"}
                style={{
                  marginLeft: theme.spacing(1),
                  marginRight: theme.spacing(1),
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPopoverElement(event.currentTarget);
                }}
              >
                <DotsVertical></DotsVertical>
              </IconButton>
            </Box>
          </Box>
          {summary && summary.summary.trim().length > 0 && (
            <Typography className={clsx(classes.summary)} onClick={openNote}>
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
          {references.map((reference, offset) => {
            return (
              <Box
                style={{
                  display: "flex",
                  flexDirection: "row",
                  // marginBottom: theme.spacing(1),
                }}
                key={note.filePath + offset}
              >
                <Box style={{ width: "32px" }}>
                  <Typography
                    style={{ fontWeight: "bold" }}
                    color={"textPrimary"}
                  >
                    {reference.parentToken.map[0] + 1}:
                  </Typography>
                </Box>
                <Box
                  className={clsx(classes.markdownPreview)}
                  onClick={() => {
                    if (note) {
                      crossnoteContainer.addTabNode({
                        type: "tab",
                        component: "Note",
                        config: {
                          singleton: false,
                          note,
                          notebook: crossnoteContainer.getNotebookAtPath(
                            note.notebookPath,
                          ),
                          reference: Object.assign({}, reference) as Reference,
                        },
                        name: `📝 ` + note.title,
                      });
                    }
                  }}
                >
                  {/*
                  <MarkdownPreview
                    note={note}
                    markdown={reference.parentToken.content}
                  ></MarkdownPreview>
                  */}
                  <Typography style={{ color: theme.palette.text.secondary }}>
                    {reference.parentToken.content}
                  </Typography>
                </Box>
              </Box>
            );
          })}
          <Typography variant={"caption"} className={clsx(classes.filePath)}>
            {note.filePath +
              (gitStatus ? " - " + t(`git/status/${gitStatus}`) : "")}
          </Typography>
        </Box>
      </Box>
      <NotePopover
        tabNode={props.tabNode}
        note={note}
        anchorElement={popoverElement}
        onClose={() => setPopoverElement(null)}
      ></NotePopover>
    </React.Fragment>
  );
}
