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
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { BookEdit, Keyboard, ThemeLightDark, Translate } from "mdi-material-ui";
import React, { useState } from "react";
import { SketchPicker } from "react-color";
import { useTranslation } from "react-i18next";
import { SettingsContainer } from "../containers/settings";
import { EditorMode } from "../lib/editorMode";
import { KeyMap } from "../lib/keymap";
import { themeManager } from "../themes/manager";
const GitCommit = __GIT_COMMIT__;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    settingsPanel: {
      height: "100%",
      overflow: "auto",
      backgroundColor: theme.palette.background.default,
    },
    settingsCard: {
      padding: theme.spacing(2),
      width: "600px",
      maxWidth: "100%",
      position: "relative",
      margin: `${theme.spacing(4)}px auto`,
      height: "fit-content",
      [theme.breakpoints.down("sm")]: {
        top: "0",
        margin: "0 auto",
        height: "100%",
        overflow: "auto",
      },
    },
    section: {
      marginTop: theme.spacing(4),
    },
    swatch: {
      padding: "4px",
      backgroundColor: "#fff",
      borderRadius: "1px",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
      display: "inline-block",
      cursor: "pointer",
    },
    color: {
      width: "36px",
      height: "18px",
      borderRadius: "2px",
    },
    editorText: {
      marginLeft: theme.spacing(4),
    },
    editorCursor: {
      borderLeftStyle: "solid",
      borderLeftWidth: "2px",
      padding: "0",
      position: "relative",
    },
  }),
);

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

interface Props {}
export function Settings(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [colorPickerAnchorElement, setColorPickerAnchorElement] =
    useState<HTMLElement>(null);
  const displayColorPicker = Boolean(colorPickerAnchorElement);
  const settingsContainer = SettingsContainer.useContainer();

  return (
    <Box className={clsx(classes.settingsPanel)}>
      <Card className={clsx(classes.settingsCard)}>
        <Box
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Typography variant={"h6"}>{t("general/Settings")}</Typography>
        </Box>
        <Box className={clsx(classes.section)}>
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
        </Box>
        <Box className={clsx(classes.section)}>
          <TextField
            label={t("settings/author-name")}
            placeholder={t("account/Anonymous")}
            fullWidth
            margin="normal"
            InputLabelProps={{
              shrink: true,
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
        </Box>
        <Box className={clsx(classes.section)}>
          <TextField
            label={t("settings/author-email")}
            placeholder={"anonymous@example.com"}
            fullWidth
            margin="normal"
            InputLabelProps={{
              shrink: true,
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
        </Box>
        <Box className={clsx(classes.section)}>
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
        </Box>
        <Box className={clsx(classes.section)}>
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
            <Box
              className={clsx(classes.swatch)}
              onClick={(event: React.MouseEvent<HTMLElement>) =>
                setColorPickerAnchorElement(event.currentTarget)
              }
            >
              <Box
                className={clsx(classes.color)}
                style={{ backgroundColor: settingsContainer.editorCursorColor }}
              ></Box>
            </Box>
            <div className={clsx(classes.editorText)}>
              {t("settings/hello")}
              <span
                className={clsx(classes.editorCursor)}
                style={{
                  borderLeftColor:
                    settingsContainer.editorCursorColor || "#4A90E2",
                }}
              ></span>
              {t("settings/world")}
            </div>
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
        </Box>

        <Box className={clsx(classes.section)}>
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
        </Box>

        <Box className={clsx(classes.section)}>
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
        </Box>

        <Box className={clsx(classes.section)}>
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
        </Box>
        <Box className={clsx(classes.section)} style={{ marginTop: "32px" }}>
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
        </Box>
      </Card>
    </Box>
  );
}
