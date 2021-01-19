import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@material-ui/core";
import useInterval from "@use-it/interval";
import { ChevronDown, Translate } from "mdi-material-ui";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";

interface Props {}
export default function LanguageSelectorDialog(props: Props) {
  const { t } = useTranslation();
  // const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const languages = ["en-US", "zh-CN", "zh-TW", "ja-JP"];
  // const fullScreen = useMediaQuery(theme.breakpoints.down("xs"));

  const [open, setOpen] = useState<boolean>(
    crossnoteContainer.notebooks.length <= 1 &&
      !localStorage.getItem("settings/language"),
  );
  const [titleLanguage, setTitleLanguage] = useState<string>(languages[0]);

  const chooseLanguage = useCallback((language: string) => {
    settingsContainer.setLanguage(language);
    setOpen(false);
  }, []);

  useInterval(() => {
    let index = languages.findIndex((x) => x === titleLanguage);
    index = index + 1;
    if (index >= languages.length) {
      index = 0;
    }
    setTitleLanguage(languages[index]);
  }, 5000);

  return (
    <Dialog
      open={open}
      fullWidth={true}
      style={{ zIndex: 2000 }}
      onClose={() => chooseLanguage("en-US")}
    >
      <DialogTitle style={{ textAlign: "center" }}>
        {"📝 " + t("widget/crossnote.auth/welcome", { lng: titleLanguage })}
      </DialogTitle>
      <DialogContent>
        <Typography
          variant={"body2"}
          style={{
            fontSize: "0.75rem",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          <Translate style={{ marginRight: "8px" }}></Translate>
          {t("language-selector-dialog/subtitle", { lng: titleLanguage })}
        </Typography>
        <Typography
          variant={"body2"}
          style={{
            fontSize: "0.75rem",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          <ChevronDown></ChevronDown>
        </Typography>
        <List>
          <ListItem button onClick={() => chooseLanguage("en-US")}>
            <ListItemText style={{ textAlign: "center" }}>English</ListItemText>
          </ListItem>
          <ListItem button onClick={() => chooseLanguage("zh-CN")}>
            <ListItemText style={{ textAlign: "center" }}>
              简体中文
            </ListItemText>
          </ListItem>
          <ListItem button onClick={() => chooseLanguage("zh-TW")}>
            <ListItemText style={{ textAlign: "center" }}>
              繁体中文
            </ListItemText>
          </ListItem>
          <ListItem button onClick={() => chooseLanguage("ja-JP")}>
            <ListItemText style={{ textAlign: "center" }}>日本語</ListItemText>
          </ListItem>
        </List>
      </DialogContent>
    </Dialog>
  );
}
