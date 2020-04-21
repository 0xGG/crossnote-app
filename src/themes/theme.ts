import { ThemeOptions, Theme, createMuiTheme } from "@material-ui/core";
import { ThemeName } from "vickymd/theme";

interface CrossnoteThemeProps {
  name: ThemeName;
  muiThemeOptions: ThemeOptions;
}

export class CrossnoteTheme {
  public name: ThemeName;
  public muiTheme: Theme;
  constructor({ name, muiThemeOptions }: CrossnoteThemeProps) {
    this.name = name;
    this.muiTheme = createMuiTheme(muiThemeOptions);
  }
}
