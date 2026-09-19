import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { darken, styled, useTheme } from "@mui/material/styles";
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
import { getNoteIcon, Note } from "../lib/note";
import { Reference } from "../lib/reference";
import { resolveNoteImageSrc } from "../utilities/image";
import { generateSummaryFromMarkdown, Summary } from "../utilities/note";
import { Emoji } from "./EmojiWrapper";
import NotePopover from "./NotePopover";

export const NoteCardMargin = 4;

const NoteCardRoot = styled(Box)(({ theme }) => ({
  maxWidth: "100%",
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  padding: theme.spacing(2, 0.5, 0),
  textAlign: "left",
  // backgroundColor: theme.palette.background.paper,
  margin: `${NoteCardMargin}px auto`,
  [theme.breakpoints.down("md")]: {
    marginLeft: 0,
    marginRight: 0,
  },
}));

const LeftPanel = styled(Box)(({ theme }) => ({
  width: "48px",
  paddingLeft: theme.spacing(0.5),
}));

const Duration = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

const RightPanel = styled(Box)(({ theme }) => ({
  width: "calc(100% - 48px)",
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const Header = styled(Box)(({ theme }) => ({
  "color": theme.palette.text.primary,
  "marginBottom": theme.spacing(1),
  "wordBreak": "break-all",
  "&:hover": {
    backgroundColor: darken(theme.palette.background.paper, 0.08),
    cursor: "pointer",
  },
  "flex": 1,
  "display": "flex",
  "alignItems": "center",
}));

const SummaryText = styled(Typography)(({ theme }) => ({
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
}));

const FilePath = styled(Typography)(({ theme }) => ({
  wordBreak: "break-all",
  color: theme.palette.text.primary,
}));

const Images = styled(Box)(({ theme }) => ({
  display: "flex",
  width: "100%",
  overflow: "hidden",
  position: "relative",
  marginBottom: theme.spacing(1),
}));

const ImagesWrapper = styled(Box)({
  display: "flex",
  alignItems: "center",
  flexDirection: "row",
});

const ImageTile = styled("div")(({ theme }) => ({
  width: "128px",
  height: "80px",
  marginRight: theme.spacing(1),
  position: "relative",
  backgroundSize: "cover",
  backgroundPosition: "center",
  display: "block",
  borderRadius: "6px",
}));

const PinIcon = styled(Pin)(({ theme }) => ({
  color: theme.palette.secondary.main,
  marginTop: theme.spacing(1),
}));

const ReferencePreview = styled(Box)(({ theme }) => ({
  "width": "calc(100% - 32px)",
  "&:hover": {
    backgroundColor: darken(theme.palette.background.paper, 0.08),
    cursor: "pointer",
  },
}));

interface Props {
  tabNode: TabNode;
  note: Note;
  referredNote?: Note;
}

export default function NoteCard(props: Props) {
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
          component: "Note",
          singleton: false,
          noteFilePath: note.filePath,
          notebookPath: note.notebookPath,
          icon: getNoteIcon(note),
        },
        name: note.title,
      });
    }
  }, [note, crossnoteContainer.addTabNode]);

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
  }, [note, props.referredNote, crossnoteContainer.getNotebookAtPath]);

  useEffect(() => {
    setHeader(`${note.title}`);
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
      <NoteCardRoot className={"note-card"}>
        <LeftPanel>
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
            <Duration>{duration}</Duration>
          </Tooltip>

          {note.config.pinned && <PinIcon></PinIcon>}
        </LeftPanel>
        <RightPanel>
          <Box
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Header onClick={openNote}>
              <Emoji emoji={getNoteIcon(note)} size={16}></Emoji>
              <Typography
                style={{
                  fontWeight: "bold",
                  marginBottom: "0",
                  marginLeft: theme.spacing(1),
                }}
                variant={"body1"}
              >
                {header}
              </Typography>
            </Header>
            <Box style={{ display: "flex", alignItems: "center" }}>
              {props.referredNote && (
                <Chip
                  variant={"outlined"}
                  style={{
                    marginLeft: theme.spacing(1),
                    marginRight: theme.spacing(1),
                  }}
                  label={`${references.length} ${t("general/reference(s)")}`}
                  size={"small"}
                ></Chip>
              )}
              <IconButton
                aria-label={t("general/note-menu")}
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
            <SummaryText onClick={openNote}>
              {summary && summary.summary.slice(0, 200)}
            </SummaryText>
          )}
          {images.length > 0 && (
            <Images>
              <ImagesWrapper>
                {images.map((image, offset) => (
                  <ImageTile
                    key={`${image}-${offset}`}
                    style={{
                      backgroundImage: `url(${image})`,
                    }}
                  ></ImageTile>
                ))}
              </ImagesWrapper>
            </Images>
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
                <ReferencePreview
                  onClick={() => {
                    if (note) {
                      crossnoteContainer.addTabNode({
                        type: "tab",
                        component: "Note",
                        config: {
                          component: "Note",
                          singleton: false,
                          noteFilePath: note.filePath,
                          notebookPath: note.notebookPath,
                          reference: Object.assign({}, reference) as Reference,
                          icon: getNoteIcon(note),
                        },
                        name: note.title,
                      });
                    }
                  }}
                >
                  <Typography style={{ color: theme.palette.text.secondary }}>
                    {reference.parentToken.content}
                  </Typography>
                </ReferencePreview>
              </Box>
            );
          })}
          <FilePath variant={"caption"}>
            {note.filePath +
              (gitStatus ? " - " + t(`git/status/${gitStatus}`) : "")}
          </FilePath>
        </RightPanel>
      </NoteCardRoot>
      <NotePopover
        tabNode={props.tabNode}
        note={note}
        anchorElement={popoverElement}
        onClose={() => setPopoverElement(null)}
      ></NotePopover>
    </React.Fragment>
  );
}
