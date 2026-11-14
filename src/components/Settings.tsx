import {
  Box,
  Card,
  FormControlLabel,
  Link,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { BookEdit, ThemeLightDark, Translate } from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { SettingsContainer } from "../containers/settings";
import { EditorMode } from "../lib/editorMode";
import { themeManager } from "../themes/manager";
import StorageSettings from "./StorageSettings";
const GitCommit = __GIT_COMMIT__;

const SettingsPanel = styled(Box)(({ theme }) => ({
  height: "100%",
  overflow: "auto",
  backgroundColor: theme.palette.background.default,
}));

const SettingsCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  width: "600px",
  maxWidth: "100%",
  position: "relative",
  margin: `${theme.spacing(4)} auto`,
  height: "fit-content",
  [theme.breakpoints.down("md")]: {
    top: "0",
    margin: "0 auto",
    height: "100%",
    overflow: "auto",
  },
}));

const Section = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(4),
}));

export function Settings() {
  const { t } = useTranslation();
  const settingsContainer = SettingsContainer.useContainer();

  return (
    <SettingsPanel>
      <SettingsCard>
        <Box
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Typography variant={"h6"}>{t("general/Settings")}</Typography>
        </Box>
        <Section>
          <Typography
            variant={"body2"}
            style={{
              fontSize: "0.75rem",
              marginBottom: "6px",
            }}
          >
            <Translate style={{ marginRight: "8px" }}></Translate>
            {"Languages/语言"}
          </Typography>
          <Select
            variant={"standard"}
            value={settingsContainer.language}
            onChange={(event) =>
              settingsContainer.setLanguage(event.target.value as string)
            }
          >
            <MenuItem value={"en-US"}>English</MenuItem>
            <MenuItem value={"zh-CN"}>简体中文</MenuItem>
            <MenuItem value={"zh-TW"}>繁体中文</MenuItem>
            <MenuItem value={"ja-JP"}>日本語</MenuItem>
          </Select>
        </Section>
        <Section>
          <TextField
            label={t("settings/author-name")}
            placeholder={t("account/Anonymous")}
            fullWidth
            margin="normal"
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
            value={settingsContainer.authorName}
            onChange={(event) =>
              settingsContainer.setAuthorName(event.currentTarget.value)
            }
            style={{
              marginTop: "0",
              marginBottom: "0",
            }}
          ></TextField>
        </Section>
        <Section>
          <TextField
            label={t("settings/author-email")}
            placeholder={"anonymous@example.com"}
            fullWidth
            margin="normal"
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
            value={settingsContainer.authorEmail}
            onChange={(event) =>
              settingsContainer.setAuthorEmail(event.currentTarget.value)
            }
            style={{
              marginTop: "0",
              marginBottom: "0",
            }}
          ></TextField>
        </Section>
        <Section>
          <Typography
            variant={"body2"}
            style={{
              fontSize: "0.75rem",
              marginBottom: "6px",
              marginTop: "16px",
            }}
          >
            <ThemeLightDark style={{ marginRight: "8px" }}></ThemeLightDark>
            {t("settings/theme")}
          </Typography>
          <Select
            value={settingsContainer.theme.name}
            onChange={(event) => {
              settingsContainer.setTheme(event.target.value as string);
            }}
          >
            {themeManager.themes.map((theme) => {
              return (
                <MenuItem key={theme.name} value={theme.name}>
                  {theme.name}
                </MenuItem>
              );
            })}
          </Select>
        </Section>
        <Section>
          <Typography
            variant={"body2"}
            style={{
              fontSize: "0.75rem",
              marginBottom: "6px",
              marginTop: "16px",
            }}
          >
            <BookEdit style={{ marginRight: "8px" }}></BookEdit>
            {t("settings/default-editor-mode")}
          </Typography>
          <Select
            value={settingsContainer.defaultEditorMode}
            onChange={(event) => {
              settingsContainer.setDefaultEditorMode(
                event.target.value as EditorMode,
              );
            }}
          >
            <MenuItem value={EditorMode.Preview}>
              {t("editor/note-control/preview") as string}
            </MenuItem>
            <MenuItem value={EditorMode.EchoMD}>
              {t("general/echomd") as string}
            </MenuItem>
            <MenuItem value={EditorMode.SourceCode}>
              {t("editor/note-control/source-code") as string}
            </MenuItem>
          </Select>
        </Section>

        <Section>
          <FormControlLabel
            control={
              <Switch
                color="primary"
                checked={settingsContainer.sourceCodeLineNumbers}
                onChange={(event) => {
                  settingsContainer.setSourceCodeLineNumbers(
                    event.target.checked,
                  );
                }}
              />
            }
            label={t("settings/source-code-line-numbers")}
          />
        </Section>

        <Section>
          <StorageSettings></StorageSettings>
        </Section>
        <Section style={{ marginTop: "32px" }}>
          <Link
            href={"https://github.com/0xGG/crossnote-app"}
            target={"_blank"}
          >
            <Typography variant={"caption"}>
              {"🤔 " + t("settings/about-this-project")}
            </Typography>
          </Link>
          <br></br>
          <Link
            href={"https://github.com/0xGG/crossnote-app/issues"}
            target={"_blank"}
          >
            <Typography variant={"caption"}>
              {"👀 " + t("settings/issues-and-feature-requests")}
            </Typography>
          </Link>
          <br></br>
          <Link
            href={`https://github.com/0xGG/crossnote-app/commit/${GitCommit.hash}`}
            target={"_blank"}
          >
            <Typography variant={"caption"}>
              {"🛠 Build " + GitCommit.logMessage}
            </Typography>
          </Link>
        </Section>
      </SettingsCard>
    </SettingsPanel>
  );
}
