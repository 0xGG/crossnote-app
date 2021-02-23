import { ThemeName } from "@0xgg/echomd/theme";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createContainer } from "unstated-next";
import { getKeyMap, KeyMap } from "../lib/keymap";
import { themeManager } from "../themes/manager";
import { CrossnoteTheme } from "../themes/theme";

interface InitialState {}

function useSettingsContainer(initialState: InitialState) {
  const [language, setLanguage] = useState<string>(
    localStorage.getItem("settings/language") || "en-US",
  );
  const [editorCursorColor, setEditorCursorColor] = useState<string>(
    localStorage.getItem("settings/editorCursorColor") ||
      "rgba(74, 144, 226, 1)",
  );
  const [authorName, setAuthorName] = useState<string>(
    localStorage.getItem("settings/authorName") || "Anonymous",
  );
  const [authorEmail, setAuthorEmail] = useState<string>(
    localStorage.getItem("settings/authorEmail") || "anonymous@crossnote.app",
  );
  const [theme, setTheme] = useState<CrossnoteTheme>(
    themeManager.getTheme(localStorage.getItem("settings/theme")) ||
      themeManager.selectedTheme,
  );
  const [keyMap, setKeyMap] = useState<KeyMap>(
    getKeyMap(localStorage.getItem("settings/keyMap")) || KeyMap.DEFAULT,
  );

  const { t, i18n } = useTranslation();

  const _setLanguage = useCallback(
    (language: string) => {
      if (
        language === "en-US" ||
        language === "zh-CN" ||
        language === "zh-TW" ||
        language === "ja-JP"
      ) {
        localStorage.setItem("settings/language", language);
        setLanguage(language);
        i18n.changeLanguage(language);
      } else {
        localStorage.setItem("settings/language", "en-US");
        setLanguage("en-US");
        i18n.changeLanguage("en-US");
      }
    },
    [i18n],
  );

  const _setEditorCursorColor = useCallback((editorCursorColor: string) => {
    editorCursorColor = editorCursorColor || "rgba(74, 144, 226, 1)";
    localStorage.setItem("settings/editorCursorColor", editorCursorColor);
    setEditorCursorColor(editorCursorColor);
  }, []);

  const _setAuthorName = useCallback((authorName: string) => {
    localStorage.setItem("settings/authorName", authorName);
    setAuthorName(authorName);
  }, []);

  const _setAuthorEmail = useCallback((authorEmail: string) => {
    localStorage.setItem("settings/authorEmail", authorEmail);
    setAuthorEmail(authorEmail);
  }, []);

  const _setTheme = useCallback((themeName: string) => {
    themeManager.selectTheme(themeName);
    localStorage.setItem("settings/theme", themeManager.selectedTheme.name);
    setTheme(themeManager.selectedTheme);
  }, []);

  const _setKeyMap = useCallback((keyMap: KeyMap) => {
    localStorage.setItem("settings/keyMap", keyMap);
    setKeyMap(keyMap);
  }, []);

  useEffect(() => {
    const themeName = localStorage.getItem("settings/theme") as ThemeName;
    if (themeName) {
      _setTheme(themeName);
    }
  }, [_setTheme]);

  return {
    language,
    setLanguage: _setLanguage,
    editorCursorColor,
    setEditorCursorColor: _setEditorCursorColor,
    authorName,
    setAuthorName: _setAuthorName,
    authorEmail,
    setAuthorEmail: _setAuthorEmail,
    theme,
    setTheme: _setTheme,
    keyMap,
    setKeyMap: _setKeyMap,
  };
}

export const SettingsContainer = createContainer(useSettingsContainer);
