import { ThemeName } from "@0xgg/echomd/theme";
import { Theme, ThemeOptions, createTheme } from "@mui/material/styles";

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
