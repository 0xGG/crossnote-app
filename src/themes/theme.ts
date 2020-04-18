import { ThemeOptions, Theme, createMuiTheme } from "@material-ui/core";

type PreviewTheme = "github-light" | "github-dark";
type CodeBlockTheme =
  | "auto"
  | "atom-dark"
  | "atom-light"
  | "atom-material"
  | "coy"
  | "darcula"
  | "dark"
  | "default"
  | "funky"
  | "github"
  | "hopscotch"
  | "monokai"
  | "okaidia"
  | "one-dark"
  | "one-light"
  | "pen-paper-coffee"
  | "pojoaque"
  | "solarized-dark"
  | "solarized-light"
  | "twilight"
  | "vs"
  | "vue"
  | "xonokai";
type EditorTheme = "light" | "dark";

interface CrossnoteThemeProps {
  name: string;
  muiThemeOptions: ThemeOptions;
  previewTheme: PreviewTheme;
  codeBlockTheme: CodeBlockTheme;
  editorTheme: EditorTheme;
}

export class CrossnoteTheme {
  public name: string;
  public muiTheme: Theme;
  public previewTheme: PreviewTheme;
  public codeBlockTheme: CodeBlockTheme;
  public editorTheme: EditorTheme;
  constructor({
    name,
    muiThemeOptions,
    previewTheme,
    codeBlockTheme,
    editorTheme,
  }: CrossnoteThemeProps) {
    this.name = name;
    this.muiTheme = createMuiTheme(muiThemeOptions);
    this.previewTheme = previewTheme;
    this.codeBlockTheme = codeBlockTheme;
    this.editorTheme = editorTheme;
  }
}
