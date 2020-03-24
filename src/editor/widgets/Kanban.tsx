import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  Card,
  Typography,
  IconButton,
  Box,
  CardContent,
  TextField,
  Button,
  Dialog,
  DialogContent,
  DialogActions
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import {
  CardPlus,
  Close,
  ContentSave,
  Cancel,
  Plus,
  TrashCan,
  Pencil
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";

// @ts-ignore
import Board from "@lourenci/react-kanban";
import { Editor as CodeMirrorEditor } from "codemirror";
import { renderPreview } from "vickymd/preview";
const VickyMD = require("vickymd");

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    columnHeader: {
      width: "256px",
      maxWidth: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    kanbanCard: {
      width: "256px",
      maxWidth: "100%",
      position: "relative",
      [theme.breakpoints.down("sm")]: {
        marginTop: "4px",
        marginBottom: "4px"
      }
    },
    editorWrapper: {
      // height: "160px",
      // border: "2px solid #96c3e6",
      "& .CodeMirror-gutters": {
        display: "none"
      }
    },
    textarea: {
      width: "100%",
      height: "100%"
    },
    preview: {
      padding: theme.spacing(2)
    }
  })
);

interface KanbanCard {
  id: number;
  title: string;
  description: string;
}

interface kanbanColumn {
  id: number;
  title: string;
  wip: boolean;
  cards: KanbanCard[];
}

interface KanbanBoard {
  columns: kanbanColumn[];
}

interface KanbanColumnHeaderProps {
  column: kanbanColumn;
  board: KanbanBoard;
  refreshBoard: (board: Board) => void;
  isPreview: boolean;
}

function KanbanColumnHeaderDisplay(props: KanbanColumnHeaderProps) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const column = props.column;
  const board = props.board;
  const isPreview = props.isPreview;
  const refreshBoard = props.refreshBoard;
  const [clickedTitle, setClickedTitle] = useState<boolean>(false);
  const [titleValue, setTitleValue] = useState<string>(column.title);

  useEffect(() => {
    if (!clickedTitle && titleValue !== column.title) {
      column.title = titleValue || t("general/Untitled");
      setTitleValue(column.title);
      refreshBoard(board);
    }
  }, [clickedTitle, board, column.title, titleValue, t, refreshBoard]);

  return (
    <Box className={clsx(classes.columnHeader)}>
      <Box>
        {clickedTitle ? (
          <TextField
            value={titleValue}
            onChange={event => {
              setTitleValue(event.target.value);
            }}
            onBlur={() => {
              setClickedTitle(false);
            }}
            onKeyUp={event => {
              if (event.which === 13) {
                setClickedTitle(false);
              }
            }}
          ></TextField>
        ) : (
          <Typography
            variant={"body1"}
            style={{ cursor: "text" }}
            onClick={() => {
              if (!isPreview) {
                setClickedTitle(true);
              }
            }}
          >
            {titleValue}
          </Typography>
        )}
      </Box>
      {!isPreview && (
        <Box>
          <IconButton
            onClick={() => {
              const card: KanbanCard = {
                id: Date.now(),
                title: "", //"Card " + column.cards.length,
                description: t("general/empty")
              };
              if (column) {
                column.cards.push(card);
              }
              props.refreshBoard(board);
            }}
          >
            <CardPlus></CardPlus>
          </IconButton>
          <IconButton
            onClick={() => {
              board.columns = board.columns.filter(l => column.id !== l.id);
              props.refreshBoard(board);
            }}
          >
            <Close></Close>
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

interface KanbanCardProps {
  card: KanbanCard;
  board: KanbanBoard;
  refreshBoard: (board: Board) => void;
  isPreview: boolean;
}
function KanbanCardDisplay(props: KanbanCardProps) {
  const classes = useStyles(props);
  const board = props.board;
  const card = props.card;
  const isPreview = props.isPreview;
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null
  );
  const [previewElement, setPreviewElement] = React.useState<HTMLElement>(null);

  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [description, setDescription] = useState<string>(card.description);
  const [editorDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const { t } = useTranslation();

  useEffect(() => {
    setDescription(card.description);
  }, [card.description]);

  useEffect(() => {
    if (textAreaElement) {
      const editor: CodeMirrorEditor = VickyMD.fromTextArea(textAreaElement, {
        mode: {
          name: "hypermd",
          hashtag: true
        },
        inputStyle: "textarea"
        // autofocus: false
      });
      editor.setValue(card.description);
      editor.setOption("lineNumbers", false);
      editor.setOption("foldGutter", false);
      editor.setOption("autofocus", false);
      if (isPreview) {
        editor.setOption("readOnly", "nocursor");
      }
      editor.on("changes", () => {
        setDescription(editor.getValue());
      });
      editor.focus();
      /*
      // Cause save not working
      editor.on("blur", () => {
        setClickedPreview(false);
        setEditor(null);
      });
      */
      // editor.display.input.blur();
      setEditor(editor);
    }
  }, [textAreaElement]);

  useEffect(() => {
    if (previewElement) {
      renderPreview(previewElement, card.description);
    }
  }, [previewElement]);

  return (
    <Card className={clsx(classes.kanbanCard)}>
      <div
        className={clsx("preview", classes.preview)}
        ref={(element: HTMLElement) => {
          setPreviewElement(element);
        }}
      ></div>
      {!isPreview && (
        <Box style={{ position: "absolute", top: "0", right: "0", zIndex: 99 }}>
          <IconButton onClick={() => setEditDialogOpen(true)}>
            <Pencil></Pencil>
          </IconButton>
          <IconButton
            onClick={() => {
              board.columns.forEach(column => {
                column.cards = column.cards.filter(c => c.id !== card.id);
              });
              props.refreshBoard(board);
            }}
          >
            <Close></Close>
          </IconButton>
        </Box>
      )}
      <Dialog open={editorDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogContent>
          <Box
            className={clsx(classes.editorWrapper)}
            style={{ minWidth: "300px", maxWidth: "100%" }}
          >
            <textarea
              className={classes.textarea}
              ref={(element: HTMLTextAreaElement) => {
                setTextAreaElement(element);
              }}
            ></textarea>
          </Box>
        </DialogContent>
        <DialogActions>
          <IconButton
            onClick={() => {
              card.description = description;
              props.refreshBoard(props.board);
              setEditDialogOpen(false);
            }}
          >
            <ContentSave></ContentSave>
          </IconButton>
          <IconButton
            onClick={() => {
              if (editor) {
                editor.setValue(card.description);
              }
              setDescription(card.description);
              setEditDialogOpen(false);
            }}
          >
            <Cancel></Cancel>
          </IconButton>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function KanbanWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [board, setBoard] = useState<KanbanBoard>(
    props.attributes["board"] || {
      columns: []
    }
  );

  if ("lanes" in (board as any)) {
    board.columns = (board as any).lanes;
  }

  const refreshBoard = (board: KanbanBoard) => {
    const newBoard = Object.assign({}, board);
    props.setAttributes({ board: newBoard });
    setBoard(newBoard as KanbanBoard);
  };

  return (
    <div>
      <Board
        renderColumnHeader={(column: kanbanColumn) => (
          <KanbanColumnHeaderDisplay
            column={column}
            board={board}
            refreshBoard={refreshBoard}
            isPreview={props.isPreview}
          ></KanbanColumnHeaderDisplay>
        )}
        renderCard={(card: KanbanCard, { dragging }: { dragging: boolean }) => {
          return (
            <KanbanCardDisplay
              card={card}
              board={board}
              refreshBoard={refreshBoard}
              isPreview={props.isPreview}
            ></KanbanCardDisplay>
          );
        }}
        allowAddColumn={!props.isPreview}
        allowAddCard={!props.isPreview}
        renderColumnAdder={(): any => {
          return (
            <Box style={{ marginLeft: "16px", marginTop: "16px" }}>
              <Button
                color={"primary"}
                variant={"outlined"}
                onClick={() => {
                  board.columns.push({
                    id: Date.now(),
                    title: t("general/untitled"),
                    cards: [],
                    wip: false
                  });
                  refreshBoard(board);
                }}
              >
                <Plus></Plus>
                {t("widget/crossnote.kanban/add-column")}
              </Button>
              <Button color={"primary"} onClick={() => props.removeSelf()}>
                <TrashCan></TrashCan>
              </Button>
            </Box>
          );
          // return <ColumnAdder addColumn={addColumn} />;
        }}
        onNewColumnConfirm={(newColumn: any) => {
          board.columns.push({ id: Date.now(), ...newColumn });
          refreshBoard(board);
        }}
        disableCardDrag={props.isPreview}
        disableColumnDrag={props.isPreview}
        onCardDragEnd={(
          card: KanbanCard,
          source: { fromPosition: number; fromColumnId: number },
          destination: { toPosition: number; toColumnId: number }
        ) => {
          const { fromPosition, fromColumnId } = source;
          let { toPosition, toColumnId } = destination;
          const fromColumn = board.columns.filter(
            l => l.id === fromColumnId
          )[0];
          const toColumn = board.columns.filter(l => l.id === toColumnId)[0];
          fromColumn.cards.splice(fromPosition, 1);
          toColumn.cards = [
            ...toColumn.cards.slice(0, toPosition),
            card,
            ...toColumn.cards.slice(toPosition, toColumn.cards.length)
          ];

          refreshBoard(board);
        }}
        onColumnDragEnd={(
          b: KanbanBoard,
          source: { fromPosition: number },
          destination: { toPosition: number }
        ) => {
          const fromPosition: number = source.fromPosition;
          const toPosition: number = destination.toPosition;
          const fromColumn = board.columns[fromPosition];
          const toColumn = board.columns[toPosition];
          board.columns[toPosition] = fromColumn;
          board.columns[fromPosition] = toColumn;
          refreshBoard(board);
        }}
      >
        {board}
      </Board>
    </div>
  );
}

export const KanbanWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(<KanbanWidget {...args}></KanbanWidget>, el);
  return el;
};
