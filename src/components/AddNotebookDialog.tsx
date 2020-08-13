import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Box,
  Typography,
  DialogActions,
  Button,
  Link,
  FormControlLabel,
  Checkbox,
  ExpansionPanel,
  ExpansionPanelDetails,
  ExpansionPanelSummary,
} from "@material-ui/core";
import { ChevronDown } from "mdi-material-ui";
import { CrossnoteContainer } from "../containers/crossnote";
import Noty from "noty";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  canCancel: boolean;

  notebookName?: string;
  gitURL?: string;
  gitBranch?: string;
}

export default function AddNotebookDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [notebookName, setNotebookName] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(false);
  const [gitURL, setGitURL] = useState<string>(props.gitURL || "");
  const [gitBranch, setGitBranch] = useState<string>(props.gitBranch || "");
  const [gitUsername, setGitUsername] = useState<string>("");
  const [gitPassword, setGitPassword] = useState<string>("");
  const [gitCorsProxy, setGitCorsProxy] = useState<string>(
    "https://crossnote.app/cors/",
  );
  const [rememberCredentialsChecked, setRememberCredentialsChecked] = useState<
    boolean
  >(false);
  const { t } = useTranslation();

  const close = useCallback(() => {
    setNotebookName("");
    setGitURL("");
    setGitBranch("");
    setGitUsername("");
    setGitPassword("");
    setExpanded(false);
    props.onClose();
  }, [props]);

  const addNotebook = useCallback(async () => {
    try {
      if (gitURL.trim().length) {
        new Noty({
          type: "info",
          text: t("info/downloading-notebook"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      }
      close();
      await crossnoteContainer.addNotebook(
        notebookName,
        gitURL.trim(),
        gitBranch.trim() || "master",
        gitUsername,
        gitPassword,
        rememberCredentialsChecked,
        gitCorsProxy,
      );
    } catch (error) {
      new Noty({
        type: "error",
        text: error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      close();
    }
  }, [
    props,
    notebookName,
    gitURL,
    gitBranch,
    gitUsername,
    gitPassword,
    rememberCredentialsChecked,
    gitCorsProxy,
  ]);

  useEffect(() => {
    const i = props.gitURL.lastIndexOf("/");
    const name = props.gitURL.slice(i + 1).replace(/\.git/, "");

    setNotebookName(props.notebookName || name);
    setGitURL(props.gitURL);
    setGitBranch(props.gitBranch);
    setExpanded(true);
  }, [props.gitURL, props.gitBranch, props.notebookName]);

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!crossnoteContainer.isAddingNotebook) {
          props.onClose();
        }
      }}
    >
      <DialogTitle>{t("general/add-a-notebook")}</DialogTitle>
      <DialogContent>
        <Typography variant={"caption"}>
          {"* " + t("add-notebook-dialog/disclaimer")}
        </Typography>
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
        <ExpansionPanel
          elevation={2}
          expanded={expanded}
          onChange={() => setExpanded(!expanded)}
        >
          <ExpansionPanelSummary expandIcon={<ChevronDown></ChevronDown>}>
            <Typography>{`${t("general/git-repository")} (${t(
              "general/optional",
            )})`}</Typography>
          </ExpansionPanelSummary>
          <ExpansionPanelDetails>
            <Box>
              <TextField
                label={t("general/url")}
                placeholder={"https://github.com/0xGG/crossnote.git"}
                fullWidth={true}
                value={gitURL}
                onChange={(event) => setGitURL(event.target.value)}
              ></TextField>
              <TextField
                label={t("general/branch")}
                placeholder={"master"}
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={rememberCredentialsChecked}
                    onChange={() =>
                      setRememberCredentialsChecked(!rememberCredentialsChecked)
                    }
                    value={rememberCredentialsChecked}
                  />
                }
                label={
                  <Typography>
                    {t("general/remember-username-and-password") +
                      " " +
                      (rememberCredentialsChecked
                        ? `(${t("general/stored-locally")})`
                        : "")}
                  </Typography>
                }
              />
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
            </Box>
          </ExpansionPanelDetails>
        </ExpansionPanel>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={addNotebook}
          disabled={crossnoteContainer.isAddingNotebook}
        >
          {crossnoteContainer.isAddingNotebook
            ? `${t("general/adding")}...`
            : t("general/add")}
        </Button>
        {props.canCancel && (
          <Button onClick={props.onClose}>{t("general/cancel")}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
