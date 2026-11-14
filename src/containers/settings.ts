import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createContainer } from "unstated-next";
import { EditorMode } from "../lib/editorMode";
import { themeManager } from "../themes/manager";
import { CrossnoteTheme, type ThemeName } from "../themes/theme";

type InitialState = object;

function useSettingsContainer(initialState: InitialState) {
  const [language, setLanguage] = useState<string>(
    localStorage.getItem("settings/language") || "en-US",
  );
  const [defaultEditorMode, setDefaultEditorMode] = useState<EditorMode>(
    (localStorage.getItem("settings/defaultEditorMode") as EditorMode) ||
      EditorMode.EchoMD,
  );
  const [authorName, setAuthorName] = useState<string>(
    localStorage.getItem("settings/authorName") || "Anonymous",
  );
  const [authorEmail, setAuthorEmail] = useState<string>(
    localStorage.getItem("settings/authorEmail") || "anonymous@example.com",
  );
  const [theme, setTheme] = useState<CrossnoteTheme>(
    themeManager.getTheme(localStorage.getItem("settings/theme")) ||
      themeManager.selectedTheme,
  );
  // On unless turned off: line numbers beside a note's source.
  const [sourceCodeLineNumbers, setSourceCodeLineNumbers] = useState<boolean>(
    localStorage.getItem("settings/sourceCodeLineNumbers") !== "false",
  );

  const { i18n } = useTranslation();

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

  const _setDefaultEditorMode = useCallback((editorMode: EditorMode) => {
    localStorage.setItem("settings/defaultEditorMode", editorMode);
    setDefaultEditorMode(editorMode);
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

  const _setSourceCodeLineNumbers = useCallback((enabled: boolean) => {
    localStorage.setItem("settings/sourceCodeLineNumbers", String(enabled));
    setSourceCodeLineNumbers(enabled);
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
    defaultEditorMode,
    setDefaultEditorMode: _setDefaultEditorMode,
    authorName,
    setAuthorName: _setAuthorName,
    authorEmail,
    setAuthorEmail: _setAuthorEmail,
    theme,
    setTheme: _setTheme,
    sourceCodeLineNumbers,
    setSourceCodeLineNumbers: _setSourceCodeLineNumbers,
  };
}

export const SettingsContainer = createContainer(useSettingsContainer);
