import { DEFAULT_CORS_PROXY } from "../config";
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
  IconButton,
  Input,
  InputAdornment,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronDown, Eye, EyeOff } from "mdi-material-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import i18next from "../i18n/i18n";
import { effectiveGitProxy } from "../lib/gitConnection";
import { gitErrorMessage, notifyGit } from "../lib/gitResults";
import type { ResetPreview } from "../lib/gitRestore";
import { NotesNotSavedError } from "../lib/noteSaver";
import { failureMessage, notify } from "../lib/notifications";
import { Notebook } from "../lib/notebook";

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

const MaxClickDeleteCount = 3;
function settingsFrom(notebook: Notebook) {
  return {
    name: notebook.name,
    gitUsername: notebook.gitUsername ?? "",
    gitPassword: notebook.gitPassword ?? "",
    gitCorsProxy: notebook.gitCorsProxy ?? "",
    minutes: String(notebook.autoFetchPeriod / 60000),
  };
}

export default function ConfigureNotebookDialog(props: Props) {
  const { notebook, open, onClose: close } = props;
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => settingsFrom(notebook));
  const replacementProxy = effectiveGitProxy(draft.gitCorsProxy);
  const [expanded, setExpanded] = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clickDeleteCount, setClickDeleteCount] = useState(MaxClickDeleteCount);
  const [resetPreview, setResetPreview] = useState<ResetPreview>();
  const [resetBusy, setResetBusy] = useState(false);
  // Home keeps the dialog for its exit transition. A new visit starts with
  // the saved values, even when the same notebook opens again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(settingsFrom(notebook));
      setShowUsername(false);
      setShowPassword(false);
      setClickDeleteCount(MaxClickDeleteCount);
      setResetPreview(undefined);
    }
  }

  async function updateNotebook() {
    try {
      const credentials = await crossnoteContainer.updateNotebook(notebook, {
        name: draft.name.trim(),
        gitUsername: draft.gitUsername.trim(),
        gitPassword: draft.gitPassword,
        gitCorsProxy: draft.gitCorsProxy.trim(),
        autoFetchPeriod: (parseFloat(draft.minutes) || 0) * 60000,
      });
      close();
      if (credentials) {
        notifyGit(
          "success",
          t(
            credentials === "saved"
              ? "git/credentials-saved"
              : "git/credentials-cleared",
          ),
        );
      }
    } catch (error) {
      notifyGit("error", t("error/failed-to-save-notebook-settings"), {
        error,
        credentials: draft,
      });
    }
  }

  async function deleteNotebook() {
    try {
      await crossnoteContainer.deleteNotebook(notebook);
      close();
    } catch (error) {
      setClickDeleteCount(MaxClickDeleteCount);
      notify({
        severity: "error",
        message: failureMessage(
          i18next.t("error/failed-to-remove-notebook"),
          error,
        ),
      });
    }
  }

  async function hardResetNotebook() {
    setResetBusy(true);
    try {
      if (!resetPreview) {
        setResetPreview(await crossnoteContainer.previewReset(notebook));
        return;
      }
      const completed = await crossnoteContainer.hardResetNotebook(
        notebook,
        resetPreview,
      );
      if (!completed) return;
      close();
      notifyGit("success", t("git/reset-complete"), {
        updateFailure: completed.updateFailure,
        credentials: notebook,
      });
    } catch (error) {
      setResetPreview(undefined);
      if (error instanceof NotesNotSavedError) return;
      notifyGit("error", gitErrorMessage(error, t("git/reset-failed")), {
        error,
        credentials: notebook,
      });
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={!clickDeleteCount || resetBusy ? undefined : close}
    >
      <DialogTitle>{t("general/configure-the-notebook")}</DialogTitle>
      <DialogContent>
        <TextField
          label={t("general/notebook-name")}
          value={draft.name}
          fullWidth={true}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          style={{ marginBottom: "16px" }}
          autoComplete={"off"}
          autoCorrect={"off"}
        ></TextField>
        {!notebook.isLocal && (
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
                  value={notebook.gitURL}
                ></TextField>
                <TextField
                  label={t("general/branch")}
                  placeholder={"master"}
                  disabled={true}
                  fullWidth={true}
                  value={notebook.gitBranch || "master"}
                ></TextField>
                <TextField
                  label={t("general/cors-proxy")}
                  placeholder={DEFAULT_CORS_PROXY}
                  fullWidth={true}
                  value={draft.gitCorsProxy}
                  helperText={
                    replacementProxy !== draft.gitCorsProxy &&
                    t("git/replacement-proxy", { proxy: replacementProxy })
                  }
                  onChange={(event) =>
                    setDraft({ ...draft, gitCorsProxy: event.target.value })
                  }
                ></TextField>
                <Typography variant="body2">
                  {t("git/credentials-storage")}{" "}
                  {draft.gitCorsProxy.trim() && t("git/proxy-credentials")}
                </Typography>
                <TextField
                  label={`${t("general/Username")} (${t("general/optional")})`}
                  placeholder={`${t("general/Username")} (${t(
                    "general/optional",
                  )})`}
                  type={showUsername ? "text" : "password"}
                  fullWidth={true}
                  value={draft.gitUsername}
                  onChange={(event) =>
                    setDraft({ ...draft, gitUsername: event.target.value })
                  }
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position={"end"}>
                          <IconButton
                            aria-label="toggle username visibility"
                            onClick={() => setShowUsername(!showUsername)}
                          >
                            {" "}
                            {showUsername ? (
                              <Eye></Eye>
                            ) : (
                              <EyeOff></EyeOff>
                            )}{" "}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                ></TextField>
                <TextField
                  label={`${t("general/Password")} (${t("general/optional")})`}
                  placeholder={`${t("general/Password")} (${t(
                    "general/optional",
                  )})`}
                  type={showPassword ? "text" : "password"}
                  fullWidth={true}
                  value={draft.gitPassword}
                  onChange={(event) =>
                    setDraft({ ...draft, gitPassword: event.target.value })
                  }
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position={"end"}>
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {" "}
                            {showPassword ? (
                              <Eye></Eye>
                            ) : (
                              <EyeOff></EyeOff>
                            )}{" "}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                ></TextField>
                <Link
                  href={
                    "https://github.com/isomorphic-git/isomorphic-git#cors-support"
                  }
                  target={"_blank"}
                >
                  {t("general/why-cors-proxy")}
                </Link>
                {notebook.gitURL ? (
                  <Box style={{ marginTop: "16px" }}>
                    <Typography>
                      {t("general/check-notebook-updates-periodically")}
                    </Typography>
                    <Input
                      value={draft.minutes}
                      // Kept as typed, so that 1. can become 1.5, and only
                      // when it is a number or on its way to one, and one the
                      // notebook can keep in milliseconds.
                      onChange={(event) => {
                        const text = event.target.value;
                        if (
                          /^\d*\.?\d*$/.test(text) &&
                          Number.isFinite((parseFloat(text) || 0) * 60000)
                        ) {
                          setDraft({ ...draft, minutes: text });
                        }
                      }}
                      endAdornment={
                        <InputAdornment position="end">
                          {t("general/minutes") as string}
                        </InputAdornment>
                      }
                    ></Input>
                  </Box>
                ) : null}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
        {resetPreview && (
          <Box role="status" sx={{ mt: 2, overflowWrap: "anywhere" }}>
            <Typography>
              {t("git/reset-confirm", {
                branch: resetPreview.branch.replace(/^refs\/heads\//, ""),
                sha: resetPreview.sha,
              })}
            </Typography>
            <Box component="ul" sx={{ maxHeight: 160, overflowY: "auto" }}>
              {resetPreview.files.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {crossnoteContainer.notebooks.length > 1 && (
          <Button
            variant={"contained"}
            color={"secondary"}
            disabled={!clickDeleteCount || resetBusy || !!resetPreview}
            onClick={() => {
              setClickDeleteCount(clickDeleteCount - 1);
              if (clickDeleteCount === 1) void deleteNotebook();
            }}
          >
            {(notebook.isLocal ? t("general/close") : t("general/Delete")) +
              (clickDeleteCount < MaxClickDeleteCount
                ? ` ${clickDeleteCount}`
                : "")}
          </Button>
        )}
        {notebook.gitURL.length > 0 && (
          <Button
            variant={"contained"}
            color={"secondary"}
            disabled={resetBusy || !clickDeleteCount}
            onClick={hardResetNotebook}
          >
            {t(resetPreview ? "git/confirm-reset" : "general/hard-reset")}
          </Button>
        )}
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={updateNotebook}
          disabled={!clickDeleteCount || resetBusy || !!resetPreview}
        >
          {t("general/Save")}
        </Button>
        <Button onClick={close} disabled={!clickDeleteCount || resetBusy}>
          {t("general/cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
