import { CrossnoteTheme } from "./theme";
import { LightTheme } from "./light";
import { DarkTheme } from "./dark";

export class ThemeManager {
  public themes: CrossnoteTheme[] = [];
  public selectedTheme: CrossnoteTheme = null;
  public addTheme(theme: CrossnoteTheme) {
    this.themes.push(theme);
    if (!this.selectedTheme) {
      this.selectTheme(theme.name);
    }
  }

  public getTheme(name: string) {
    return this.themes.find((theme) => theme.name === name);
  }

  public selectTheme(name: string) {
    if (!name) {
      return;
    }
    const theme = this.themes.find((t) => t.name === name);
    if (!theme) {
      return;
    }
    this.selectedTheme = theme;

    // Set preview theme
    const previewThemeStyleElementID = "crossnote-preview-theme";
    let previewThemeStyleElement: HTMLLinkElement = document.getElementById(
      previewThemeStyleElementID,
    ) as HTMLLinkElement;
    if (!previewThemeStyleElement) {
      previewThemeStyleElement = document.createElement(
        "link",
      ) as HTMLLinkElement;
      previewThemeStyleElement.id = previewThemeStyleElementID;
      previewThemeStyleElement.rel = "stylesheet";
      document.head.appendChild(previewThemeStyleElement);
    }
    previewThemeStyleElement.href = `/styles/preview_themes/${theme.previewTheme}.css`;

    // Set code block theme
    const codeBlockThemeStyleElementID = "crossnote-code-block-theme";
    let codeBlockThemeStyleElement: HTMLLinkElement = document.getElementById(
      codeBlockThemeStyleElementID,
    ) as HTMLLinkElement;
    if (!codeBlockThemeStyleElement) {
      codeBlockThemeStyleElement = document.createElement(
        "link",
      ) as HTMLLinkElement;
      codeBlockThemeStyleElement.id = codeBlockThemeStyleElementID;
      codeBlockThemeStyleElement.rel = "stylesheet";
      document.head.appendChild(codeBlockThemeStyleElement);
    }
    codeBlockThemeStyleElement.href = `/styles/prism_themes/${theme.codeBlockTheme}.css`;

    // Set editor theme
    const editorThemeStyleElementID = "crossnote-editor-theme";
    let editorThemeStyleElement: HTMLLinkElement = document.getElementById(
      editorThemeStyleElementID,
    ) as HTMLLinkElement;
    if (!editorThemeStyleElement) {
      editorThemeStyleElement = document.createElement(
        "link",
      ) as HTMLLinkElement;
      editorThemeStyleElement.id = editorThemeStyleElementID;
      editorThemeStyleElement.rel = "stylesheet";
      document.head.appendChild(editorThemeStyleElement);
    }
    editorThemeStyleElement.href = `/styles/editor_themes/${theme.editorTheme}.css`;
  }
}

const _themeManager = new ThemeManager();
_themeManager.addTheme(LightTheme);
_themeManager.addTheme(DarkTheme);

export const themeManager = _themeManager;
