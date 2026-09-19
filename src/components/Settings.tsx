import {
  Box,
  Card,
  FormControlLabel,
  Link,
  MenuItem,
  Popover,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { BookEdit, Keyboard, ThemeLightDark, Translate } from "mdi-material-ui";
import React, { useState } from "react";
import { SketchPicker } from "react-color";
import { useTranslation } from "react-i18next";
import { SettingsContainer } from "../containers/settings";
import { EditorMode } from "../lib/editorMode";
import { KeyMap } from "../lib/keymap";
import { themeManager } from "../themes/manager";
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

const Swatch = styled(Box)({
  padding: "4px",
  backgroundColor: "#fff",
  borderRadius: "1px",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
  display: "inline-block",
  cursor: "pointer",
});

const ColorPreview = styled(Box)({
  width: "36px",
  height: "18px",
  borderRadius: "2px",
});

const EditorText = styled("div")(({ theme }) => ({
  marginLeft: theme.spacing(4),
}));

const EditorCursor = styled("span")({
  borderLeftStyle: "solid",
  borderLeftWidth: "2px",
  padding: "0",
  position: "relative",
});

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function getRGBA(inputStr: string = ""): RGBA {
  if (!inputStr || !inputStr.length || !inputStr.match(/^rgba\(/)) {
    return {
      r: 51,
      g: 51,
      b: 51,
      a: 1,
    };
  } else {
    const match = inputStr.match(
      /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
    );
    if (!match) {
      return {
        r: 51,
        g: 51,
        b: 51,
        a: 1,
      };
    } else {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        a: parseInt(match[4], 10),
      };
    }
  }
}

export function Settings() {
  const { t } = useTranslation();
  const [colorPickerAnchorElement, setColorPickerAnchorElement] =
    useState<HTMLElement>(null);
  const displayColorPicker = Boolean(colorPickerAnchorElement);
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
            {t("settings/editor-cursor-color") + " (beta)"}
          </Typography>
          <Box
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Swatch
              onClick={(event: React.MouseEvent<HTMLElement>) =>
                setColorPickerAnchorElement(event.currentTarget)
              }
            >
              <ColorPreview
                style={{ backgroundColor: settingsContainer.editorCursorColor }}
              ></ColorPreview>
            </Swatch>
            <EditorText>
              {t("settings/hello")}
              <EditorCursor
                style={{
                  borderLeftColor:
                    settingsContainer.editorCursorColor || "#4A90E2",
                }}
              ></EditorCursor>
              {t("settings/world")}
            </EditorText>
          </Box>
          <Popover
            open={displayColorPicker}
            anchorEl={colorPickerAnchorElement}
            onClose={() => {
              setColorPickerAnchorElement(null);
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "center",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "center",
            }}
          >
            <SketchPicker
              color={getRGBA(settingsContainer.editorCursorColor)}
              onChange={(color) => {
                const cursorColor = `rgba(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}, ${color.rgb.a})`;
                settingsContainer.setEditorCursorColor(cursorColor);
              }}
            ></SketchPicker>
          </Popover>
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
            <MenuItem value={EditorMode.EchoMD}>
              {t("general/echomd") as string}
            </MenuItem>
            <MenuItem value={EditorMode.Preview}>
              {t("editor/note-control/preview") as string}
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
                checked={settingsContainer.plainTextSourceCode}
                onChange={(event) => {
                  settingsContainer.setPlainTextSourceCode(
                    event.target.checked,
                  );
                }}
              />
            }
            label={t("settings/plain-text-source-code")}
          />
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
            <Keyboard style={{ marginRight: "8px" }}></Keyboard>
            {t("settings/key-map")}
          </Typography>
          <Select
            value={settingsContainer.keyMap}
            onChange={(event) => {
              settingsContainer.setKeyMap(event.target.value as KeyMap);
            }}
          >
            <MenuItem value={KeyMap.DEFAULT}>
              {t("general/Default") as string}
            </MenuItem>
            <MenuItem value={KeyMap.VIM}>{t("general/Vim") as string}</MenuItem>
            <MenuItem value={KeyMap.EMACS}>
              {t("general/Emacs") as string}
            </MenuItem>
          </Select>
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
