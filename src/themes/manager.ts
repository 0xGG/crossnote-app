import { ThemeName } from "@0xgg/echomd/theme";
import { Editor } from "codemirror";
import { EchoMDVersion } from "../editor";
import { setPreviewTheme } from "../render/theme";
import { DarkTheme } from "./dark";
import { LightTheme } from "./light";
import { OneDarkTheme } from "./one-dark";
import { SolarizedLight } from "./solarized-light";
import { CrossnoteTheme } from "./theme";

// The editor's look in each theme still comes from echomd's stylesheets,
// which the build copies to the site under echomd's version; they are named
// as the app's themes are.
const editorThemeID = "echomd-editor-theme";

export function setTheme({
  editor,
  themeName,
}: {
  editor?: Editor;
  themeName: ThemeName;
}) {
  setPreviewTheme(themeName);
  let link = document.getElementById(editorThemeID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = editorThemeID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = `/styles/echomd@${EchoMDVersion}/editor_themes/${themeName}.css`;
  if (editor && editor.getOption("theme") !== themeName) {
    editor.setOption("theme", themeName);
    editor.refresh();
  }
}

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
    setTheme({
      themeName: theme.name,
    });
  }
}

const _themeManager = new ThemeManager();
_themeManager.addTheme(LightTheme);
_themeManager.addTheme(DarkTheme);
_themeManager.addTheme(OneDarkTheme);
_themeManager.addTheme(SolarizedLight);

export const themeManager = _themeManager;
