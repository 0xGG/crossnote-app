import i18next from "i18next";
import { isAppErrorKey } from "../i18n/i18n";
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
  Divider,
  IconButton,
  InputAdornment,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ChevronDown, Eye, EyeOff, FolderOpen } from "mdi-material-ui";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { repositoryAddress } from "../lib/gitConnection";
import { gitErrorMessage, notifyGit } from "../lib/gitResults";
import { notify } from "../lib/notifications";
import { notebookNameFromGitURL } from "../utilities/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  canCancel: boolean;
  notebookName?: string;
  gitURL?: string;
  gitBranch?: string;
  hideOpeningLocal?: boolean;
}

export default function AddNotebookDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const dialog = useRef<HTMLDivElement>(null);
  const [notebookName, setNotebookName] = useState<string>(
    props.notebookName || notebookNameFromGitURL(props.gitURL ?? ""),
  );
  const [expanded, setExpanded] = useState<boolean>(true);
  const [gitURL, setGitURL] = useState(() => repositoryAddress(props.gitURL));
  const [gitBranch, setGitBranch] = useState<string>(props.gitBranch || "");
  const [gitUsername, setGitUsername] = useState<string>("");
  const [gitPassword, setGitPassword] = useState<string>("");
  const [gitCorsProxy, setGitCorsProxy] = useState<string>(DEFAULT_CORS_PROXY);
  const [showUsername, setShowUsername] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const { t } = useTranslation();
  const theme = useTheme();

  const close = useCallback(() => {
    setNotebookName("");
    setGitURL("");
    setGitBranch("");
    setGitUsername("");
    setGitPassword("");
    setGitCorsProxy(DEFAULT_CORS_PROXY);
    setShowUsername(true);
    setShowPassword(false);
    // Back to the initial expanded state: the dialog stays mounted across
    // open cycles, and the init effect re-expands only when props change,
    // so collapsing here would leave the next plain open with a folded form.
    setExpanded(true);
    props.onClose();
  }, [props]);

  const addNotebook = useCallback(async () => {
    const remote = gitURL.trim();
    try {
      await crossnoteContainer.addNotebook(
        notebookName,
        remote,
        gitBranch.trim() || "master",
        gitUsername,
        gitPassword,
        gitCorsProxy,
      );
      close();
      if (remote) {
        notifyGit(
          "success",
          t(
            gitUsername.trim() || gitPassword
              ? "git/cloned-credentials"
              : "git/cloned",
          ),
        );
      }
    } catch (error) {
      if (remote) {
        notifyGit("error", gitErrorMessage(error, t("git/clone-failed")), {
          error,
          credentials: { gitUsername, gitPassword },
          dialog: dialog.current,
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      notify({
        severity: "error",
        // The app's own errors carry a key of the language packs; the rest,
        // such as a git server's reply, are shown as they come.
        message: isAppErrorKey(message) ? i18next.t(message) : message,
      });
    }
  }, [
    crossnoteContainer,
    notebookName,
    gitURL,
    gitBranch,
    gitUsername,
    gitPassword,
    gitCorsProxy,
    close,
    t,
  ]);

  // Reset only when the incoming defaults change, not while editing the form.
  const [previousDefaults, setPreviousDefaults] = useState({
    gitURL: props.gitURL,
    gitBranch: props.gitBranch,
    notebookName: props.notebookName,
  });
  if (
    previousDefaults.gitURL !== props.gitURL ||
    previousDefaults.gitBranch !== props.gitBranch ||
    previousDefaults.notebookName !== props.notebookName
  ) {
    const gitURL = repositoryAddress(props.gitURL);
    setPreviousDefaults({
      gitURL: props.gitURL,
      gitBranch: props.gitBranch,
      notebookName: props.notebookName,
    });
    setNotebookName(props.notebookName || notebookNameFromGitURL(gitURL));
    setGitURL(gitURL);
    setGitBranch(props.gitBranch ?? "");
    setExpanded(true);
  }

  return (
    <Dialog
      open={props.open}
      slotProps={{ paper: { ref: dialog } }}
      onClose={() => {
        if (!crossnoteContainer.isAddingNotebook) {
          close();
        }
      }}
    >
      <DialogTitle>{t("general/add-a-notebook")}</DialogTitle>
      <DialogContent>
        {!props.hideOpeningLocal && (
          <Box>
            <Button
              style={{
                margin: `${theme.spacing(2)} auto`,
                padding: `${theme.spacing(2)} 0`,
                width: "100%",
              }}
              color={"primary"}
              variant={"outlined"}
              startIcon={<FolderOpen></FolderOpen>}
              size={"small"}
              onClick={() => {
                crossnoteContainer.openLocalNotebook();
                close();
              }}
              disabled={!("showDirectoryPicker" in window)}
            >
              {"showDirectoryPicker" in window
                ? t("general/open-a-local-folder")
                : t("general/your-browser-doesnt-support-to-open-local-folder")}
            </Button>
            <Box style={{ position: "relative" }}>
              <Typography
                variant={"subtitle1"}
                style={{
                  position: "absolute",
                  top: "-14px",
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              >
                {t("widget/crossnote.auth/Or")}
              </Typography>
              <Divider
                style={{
                  margin: `${theme.spacing(3)} auto`,
                  width: "100%",
                }}
              ></Divider>
            </Box>
          </Box>
        )}
        <Typography variant={"caption"}>
          {"* " + t("add-notebook-dialog/disclaimer")}
        </Typography>
        <br></br>
        <br></br>
        {/*
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
        */}
        <Accordion
          elevation={2}
          expanded={expanded}
          onChange={() => setExpanded(!expanded)}
        >
          <AccordionSummary expandIcon={<ChevronDown></ChevronDown>}>
            <Typography>{`${t("general/clone-a-git-repository")}`}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              <TextField
                label={t("general/url")}
                placeholder={"https://github.com/0xGG/crossnote-app.git"}
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
                label={t("general/cors-proxy")}
                placeholder={DEFAULT_CORS_PROXY}
                fullWidth={true}
                value={gitCorsProxy}
                onChange={(event) => setGitCorsProxy(event.target.value)}
              ></TextField>
              <Typography variant="body2">
                {t("git/credentials-storage")}{" "}
                {gitCorsProxy.trim() && t("git/proxy-credentials")}
              </Typography>
              <TextField
                label={`${t("general/Username")} (${t("general/optional")})`}
                placeholder={`${t("general/Username")} (${t(
                  "general/optional",
                )})`}
                type={showUsername ? "text" : "password"}
                fullWidth={true}
                value={gitUsername}
                onChange={(event) => setGitUsername(event.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position={"end"}>
                        <IconButton
                          aria-label="toggle username visibility"
                          onClick={() => setShowUsername(!showUsername)}
                        >
                          {" "}
                          {showUsername ? <Eye></Eye> : <EyeOff></EyeOff>}{" "}
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
                value={gitPassword}
                onChange={(event) => setGitPassword(event.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position={"end"}>
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {" "}
                          {showPassword ? <Eye></Eye> : <EyeOff></EyeOff>}{" "}
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
            </Box>
          </AccordionDetails>
        </Accordion>
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
          <Button
            onClick={close}
            disabled={crossnoteContainer.isAddingNotebook}
          >
            {t("general/cancel")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
