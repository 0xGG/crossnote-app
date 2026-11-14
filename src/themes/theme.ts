import { Theme, ThemeOptions, createTheme } from "@mui/material/styles";

/** The app's themes, by the names the settings store. */
export type ThemeName = "light" | "dark" | "one-dark" | "solarized-light";

interface CrossnoteThemeProps {
  name: ThemeName;
  muiThemeOptions: ThemeOptions;
}

export class CrossnoteTheme {
  public name: ThemeName;
  public muiTheme: Theme;
  constructor({ name, muiThemeOptions }: CrossnoteThemeProps) {
    this.name = name;
    this.muiTheme = createTheme(muiThemeOptions);
  }
}
