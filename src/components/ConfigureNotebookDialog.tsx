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
  const [expanded, setExpanded] = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clickDeleteCount, setClickDeleteCount] = useState(MaxClickDeleteCount);
  const [clickHardResetCount, setClickHardResetCount] =
    useState(MaxClickDeleteCount);
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
      setClickHardResetCount(MaxClickDeleteCount);
    }
  }

  async function updateNotebook() {
    try {
      await crossnoteContainer.updateNotebook(notebook, {
        name: draft.name.trim(),
        gitUsername: draft.gitUsername.trim(),
        gitPassword: draft.gitPassword,
        gitCorsProxy: draft.gitCorsProxy.trim(),
        autoFetchPeriod: (parseFloat(draft.minutes) || 0) * 60000,
      });
      close();
    } catch (error) {
      notify({
        severity: "error",
        message: failureMessage(
          i18next.t("error/failed-to-save-notebook-settings"),
          error,
        ),
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
    await crossnoteContainer.hardResetNotebook(notebook);
    close();
  }

  return (
    <Dialog open={open} onClose={!clickDeleteCount ? null : close}>
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
                <TextField
                  label={t("general/cors-proxy")}
                  placeholder={DEFAULT_CORS_PROXY}
                  fullWidth={true}
                  value={draft.gitCorsProxy}
                  onChange={(event) =>
                    setDraft({ ...draft, gitCorsProxy: event.target.value })
                  }
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
      </DialogContent>
      <DialogActions>
        {crossnoteContainer.notebooks.length > 1 && (
          <Button
            variant={"contained"}
            color={"secondary"}
            disabled={!clickDeleteCount}
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
            disabled={!clickHardResetCount || !clickDeleteCount}
            onClick={() => {
              setClickHardResetCount(clickHardResetCount - 1);
              if (clickHardResetCount === 1) void hardResetNotebook();
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
        <Button onClick={close} disabled={!clickDeleteCount}>
          {t("general/cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
