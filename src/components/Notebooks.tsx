import React, { useState, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Box, Typography } from "@material-ui/core";
import {
  NotebookFieldsFragment,
  useNotebooksQuery,
  NotebookOrderBy,
} from "../generated/graphql";
import { useTranslation } from "react-i18next";
import { NotebookCard } from "./NotebookCard";
import { CloudContainer } from "../containers/cloud";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notebooksList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12),
      marginTop: theme.spacing(0.5),
    },
  }),
);

interface Props {
  searchValue: string;
}

const perPage = 20;
export function Notebooks(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const cloudContainer = CloudContainer.useContainer();
  const [notebooksListElement, setNotebooksListElement] = useState<
    HTMLDivElement
  >(null);
  const [notebooks, setNotebooks] = useState<NotebookFieldsFragment[]>([]);
  const [page, setPage] = useState<number>(0);
  const [resNotebooks, executeNotebooksQuery] = useNotebooksQuery({
    variables: {
      page: page,
      perPage,
      orderBy: NotebookOrderBy.TotalStarsCount,
      query: props.searchValue,
    },
    pause: true,
  });
  const [finishedLoadingAll, setFinishedLoadingAll] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      cloudContainer.setSelectedNotebook(null);
    };
  }, []);

  useEffect(() => {
    setNotebooks([]);
    setPage(0);
    setFinishedLoadingAll(false);
  }, [props.searchValue]);

  useEffect(() => {
    if (notebooks.length === 0 && page === 0 && finishedLoadingAll === false) {
      executeNotebooksQuery();
    }
  }, [notebooks, page, finishedLoadingAll, executeNotebooksQuery]);

  useEffect(() => {
    if (resNotebooks.error) {
    } else if (resNotebooks.data) {
      const newNotebooks = resNotebooks.data.notebooks;
      setNotebooks((notebooks) => {
        const pendingNotebooks = [...notebooks, ...newNotebooks]
          .reverse()
          .filter(
            (notebook, offset, self) =>
              self.findIndex((n) => n.id === notebook.id) === offset,
          )
          .reverse();
        return pendingNotebooks;
      });
      if (newNotebooks.length < perPage) {
        setFinishedLoadingAll(true);
      }
      resNotebooks.data = null;
    }
  }, [resNotebooks]);

  useEffect(() => {
    if (!cloudContainer.selectedNotebook) {
      cloudContainer.setSelectedNotebook(notebooks[0]);
    }
  }, [notebooks]);

  return (
    <div
      className={clsx(classes.notebooksList)}
      ref={(element: HTMLElement) => {
        setNotebooksListElement(element as HTMLDivElement);
      }}
    >
      {notebooks.map((notebook) => {
        return (
          <NotebookCard notebook={notebook} key={notebook.id}></NotebookCard>
        );
      })}
      {finishedLoadingAll && notebooks.length === 0 && (
        <Typography
          style={{
            textAlign: "center",
            marginTop: "32px",
          }}
          variant={"body2"}
        >
          {"🧐 " + t("general/no-notebooks-found")}
        </Typography>
      )}
    </div>
  );
}
