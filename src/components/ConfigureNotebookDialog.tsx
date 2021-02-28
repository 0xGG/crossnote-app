import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Input,
  InputAdornment,
  Link,
  TextField,
  Typography,
} from "@material-ui/core";
import { ChevronDown } from "mdi-material-ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Notebook } from "../lib/notebook";

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

const MaxClickDeleteCount = 3;
export default function ConfigureNotebookDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [notebookName, setNotebookName] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(false);
  const [gitURL, setGitURL] = useState<string>("");
  const [gitBranch, setGitBranch] = useState<string>("");
  const [gitUsername, setGitUsername] = useState<string>("");
  const [gitPassword, setGitPassword] = useState<string>("");
  const [gitCorsProxy, setGitCorsProxy] = useState<string>(
    "https://crossnote.app/cors/",
  );
  const [autoFetchPeriod, setAutoFetchPeriod] = useState<number>(0);
  const [clickDeleteCount, setClickDeleteCount] = useState<number>(
    MaxClickDeleteCount,
  );
  const [clickHardResetCount, setClickHardResetCount] = useState<number>(
    MaxClickDeleteCount,
  );
  const isMounted = useRef<boolean>(false);
  const { t } = useTranslation();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setClickDeleteCount(MaxClickDeleteCount);
    setClickHardResetCount(MaxClickDeleteCount);
  }, [props.open]);

  useEffect(() => {
    const notebook = props.notebook;
    if (!notebook) {
      return;
    }
    setNotebookName(notebook.name);
    setGitURL(notebook.gitURL);
    setGitBranch(notebook.gitBranch || "master");
    setGitUsername(notebook.gitUsername);
    setGitPassword(notebook.gitPassword);
    setGitCorsProxy(notebook.gitCorsProxy);
    setAutoFetchPeriod(notebook.autoFetchPeriod / 60000);
  }, [props.notebook]);

  const updateNotebook = useCallback(async () => {
    const notebook = props.notebook;
    if (!notebook) {
      props.onClose();
      return;
    }
    notebook.name = notebookName.trim();
    notebook.gitURL = gitURL.trim();
    notebook.gitBranch = gitBranch.trim();
    notebook.gitUsername = gitUsername.trim();
    notebook.gitPassword = gitPassword;
    notebook.gitCorsProxy = gitCorsProxy.trim();
    notebook.autoFetchPeriod = Math.max(autoFetchPeriod * 60000, 0);
    try {
      await crossnoteContainer.updateNotebook(notebook);
    } catch (error) {}
    if (isMounted.current) {
      props.onClose();
    }
  }, [
    props,
    props.notebook,
    notebookName,
    gitURL,
    gitBranch,
    gitUsername,
    gitPassword,
    gitCorsProxy,
    autoFetchPeriod,
  ]);

  const deleteNotebook = useCallback(async () => {
    const notebook = props.notebook;
    try {
      await crossnoteContainer.deleteNotebook(notebook);
    } catch (error) {}
    if (isMounted.current) {
      props.onClose();
    }
  }, [props.notebook, props]);

  const hardResetNotebook = useCallback(async () => {
    const notebook = props.notebook;
    try {
      await crossnoteContainer.hardResetNotebook(notebook);
    } catch (error) {}
    if (isMounted.current) {
      props.onClose();
    }
  }, [props.notebook, props]);

  useEffect(() => {
    setClickDeleteCount(MaxClickDeleteCount);
  }, [props.notebook]);

  return (
    <Dialog
      open={props.open}
      onClose={!clickDeleteCount ? null : props.onClose}
    >
      <DialogTitle>{t("general/configure-the-notebook")}</DialogTitle>
      <DialogContent>
        <TextField
          label={t("general/notebook-name")}
          value={notebookName}
          fullWidth={true}
          onChange={(event) => {
            setNotebookName(event.target.value);
          }}
          style={{ marginBottom: "16px" }}
          autoComplete={"off"}
          autoCorrect={"off"}
        ></TextField>
        {!props.notebook.isLocal && (
          <Accordion
            elevation={2}
            expanded={expanded}
            onChange={() => setExpanded(!expanded)}
          >
            <AccordionSummary expandIcon={<ChevronDown></ChevronDown>}>
              <Typography>{`${t("general/git-repository")} (${t(
                "general/optional",
              )})`}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <TextField
                  label={t("general/url")}
                  placeholder={"https://abc/def.git"}
                  disabled={true}
                  fullWidth={true}
                  value={gitURL}
                  onChange={(event) => setGitURL(event.target.value)}
                ></TextField>
                <TextField
                  label={t("general/branch")}
                  placeholder={"master"}
                  disabled={true}
                  fullWidth={true}
                  value={gitBranch}
                  onChange={(event) => setGitBranch(event.target.value)}
                ></TextField>
                <TextField
                  label={`${t("general/Username")} (${t("general/optional")})`}
                  placeholder={`${t("general/Username")} (${t(
                    "general/optional",
                  )})`}
                  fullWidth={true}
                  value={gitUsername}
                  onChange={(event) => setGitUsername(event.target.value)}
                ></TextField>
                <TextField
                  label={`${t("general/Password")} (${t("general/optional")})`}
                  placeholder={`${t("general/Password")} (${t(
                    "general/optional",
                  )})`}
                  type={"password"}
                  fullWidth={true}
                  value={gitPassword}
                  onChange={(event) => setGitPassword(event.target.value)}
                ></TextField>
                <TextField
                  label={t("general/cors-proxy")}
                  placeholder={"https://crossnote.app/cors/"}
                  fullWidth={true}
                  value={gitCorsProxy}
                  onChange={(event) => setGitCorsProxy(event.target.value)}
                ></TextField>
                <Link
                  href={
                    "https://github.com/isomorphic-git/isomorphic-git#cors-support"
                  }
                  target={"_blank"}
                >
                  {t("general/why-cors-proxy")}
                </Link>
                {props.notebook && props.notebook.gitURL ? (
                  <Box style={{ marginTop: "16px" }}>
                    <Typography>
                      {t("general/check-notebook-updates-periodically")}
                    </Typography>
                    <Input
                      value={autoFetchPeriod}
                      onChange={(event) => {
                        try {
                          const value = parseFloat(event.target.value || "0");
                          if (!isNaN(value)) {
                            setAutoFetchPeriod(value);
                          }
                        } catch (error) {}
                      }}
                      endAdornment={
                        <InputAdornment position="end">
                          {t("general/minutes")}
                        </InputAdornment>
                      }
                    ></Input>
                  </Box>
                ) : null}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </DialogContent>
      <DialogActions>
        {crossnoteContainer.notebooks.length > 1 && (
          <Button
            variant={"contained"}
            color={"secondary"}
            disabled={!clickDeleteCount}
            onClick={() => {
              if (clickDeleteCount === 1) {
                deleteNotebook();
                setClickDeleteCount(clickDeleteCount - 1);
              } else {
                setClickDeleteCount(clickDeleteCount - 1);
              }
            }}
          >
            {(props.notebook.isLocal
              ? t("general/close")
              : t("general/Delete")) +
              (clickDeleteCount < MaxClickDeleteCount
                ? ` ${clickDeleteCount}`
                : "")}
          </Button>
        )}
        {props.notebook && props.notebook.gitURL.length > 0 && (
          <Button
            variant={"contained"}
            color={"secondary"}
            disabled={!clickHardResetCount || !clickDeleteCount}
            onClick={() => {
              if (clickHardResetCount === 1) {
                hardResetNotebook();
                setClickHardResetCount(clickHardResetCount - 1);
              } else {
                setClickHardResetCount(clickHardResetCount - 1);
              }
            }}
          >
            {t("general/hard-reset") +
              (clickHardResetCount < MaxClickDeleteCount
                ? ` ${clickHardResetCount}`
                : "")}
          </Button>
        )}
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={updateNotebook}
          disabled={!clickDeleteCount}
        >
          {t("general/Save")}
        </Button>
        <Button onClick={props.onClose} disabled={!clickDeleteCount}>
          {t("general/cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
