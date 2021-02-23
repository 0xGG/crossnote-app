import { ThemeName } from "@0xgg/echomd/theme";
import { createMuiTheme, Theme, ThemeOptions } from "@material-ui/core";

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
