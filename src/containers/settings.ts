import { createContainer } from "unstated-next";
import { useState, useCallback } from "react";

interface InitialState {}

function useSettingsContainer(initialState: InitialState) {
  const [language, setLanguage] = useState<string>(
    localStorage.getItem("settings/language") || "en-US"
  );
  const [editorCursorColor, setEditorCursorColor] = useState<string>(
    localStorage.getItem("settings/editorCursorColor") || "rgba(51, 51, 51, 1)"
  );

  const _setLanguage = useCallback((language: string) => {
    if (
      language === "en-US" ||
      language === "zh-CN" ||
      language === "zh-TW" ||
      language === "ja-JP"
    ) {
      localStorage.setItem("settings/language", language);
      setLanguage(language);
    } else {
      localStorage.setItem("settings/language", "en-US");
      setLanguage("en-US");
    }
  }, []);

  const _setEditorCursorColor = useCallback((editorCursorColor: string) => {
    localStorage.setItem("settings/editorCursorColor", editorCursorColor);
    setEditorCursorColor(editorCursorColor);
  }, []);

  return {
    language,
    setLanguage: _setLanguage,
    editorCursorColor,
    setEditorCursorColor: _setEditorCursorColor
  };
}

export const SettingsContainer = createContainer(useSettingsContainer);
