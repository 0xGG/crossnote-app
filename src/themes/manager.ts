import { CrossnoteTheme } from "./theme";
import { LightTheme } from "./light";
import { DarkTheme } from "./dark";

export class ThemeManager {
  private themes: CrossnoteTheme[] = [];
  public addTheme(theme: CrossnoteTheme) {
    this.themes.push(theme);
  }

  public getTheme(name: string) {
    return this.themes.find((theme) => theme.name === name);
  }
}

export const themeManager = new ThemeManager();

themeManager.addTheme(LightTheme);
themeManager.addTheme(DarkTheme);
