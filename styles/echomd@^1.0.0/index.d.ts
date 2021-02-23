export declare type ThemeName = "light" | "dark" | "one-dark" | "solarized-light";
export declare type EditorTheme = "light" | "dark" | "one-dark" | "solarized-light";
export declare type PreviewTheme = "github-light" | "github-dark" | "one-dark" | "solarized-light";
export declare type CodeBlockTheme = "github" | "monokai" | "one-dark" | "solarized-light";
export interface Theme {
    name: ThemeName;
    editorTheme: EditorTheme;
    previewTheme: PreviewTheme;
    codeBlockTheme: CodeBlockTheme;
}
export declare const Themes: Theme[];
export declare function setTheme({ editor, themeName, baseUri, }: {
    editor?: CodeMirror.Editor;
    themeName: ThemeName;
    baseUri: string;
}): void;
