
(function (mod){ //[HyperMD] UMD patched!
  /*commonjs*/  ("object"==typeof exports&&"undefined"!=typeof module) ? mod(null, exports, ) :
  /*amd*/       ("function"==typeof define&&define.amd) ? define(["require","exports"], mod) :
  /*plain env*/ mod(null, (this.HyperMD.Theme = this.HyperMD.Theme || {}), );
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setTheme = exports.Themes = void 0;
    exports.Themes = [
        {
            name: "light",
            editorTheme: "light",
            previewTheme: "github-light",
            codeBlockTheme: "github",
        },
        {
            name: "dark",
            editorTheme: "dark",
            previewTheme: "github-dark",
            codeBlockTheme: "monokai",
        },
        {
            name: "one-dark",
            editorTheme: "one-dark",
            previewTheme: "one-dark",
            codeBlockTheme: "one-dark",
        },
        {
            name: "solarized-light",
            editorTheme: "solarized-light",
            previewTheme: "solarized-light",
            codeBlockTheme: "solarized-light",
        },
    ];
    function setTheme(_a) {
        var editor = _a.editor, themeName = _a.themeName, _b = _a.baseUri, baseUri = _b === void 0 ? "./" : _b;
        var theme = exports.Themes.find(function (t) { return t.name === themeName; });
        if (!theme) {
            return;
        }
        // Set preview theme
        var previewThemeStyleElementID = "vickymd-preview-theme";
        var previewThemeStyleElement = document.getElementById(previewThemeStyleElementID);
        if (!previewThemeStyleElement) {
            previewThemeStyleElement = document.createElement("link");
            previewThemeStyleElement.id = previewThemeStyleElementID;
            previewThemeStyleElement.rel = "stylesheet";
            document.head.appendChild(previewThemeStyleElement);
        }
        previewThemeStyleElement.href =
            baseUri + ("preview_themes/" + theme.previewTheme + ".css");
        // Set code block theme
        var codeBlockThemeStyleElementID = "vickymd-code-block-theme";
        var codeBlockThemeStyleElement = document.getElementById(codeBlockThemeStyleElementID);
        if (!codeBlockThemeStyleElement) {
            codeBlockThemeStyleElement = document.createElement("link");
            codeBlockThemeStyleElement.id = codeBlockThemeStyleElementID;
            codeBlockThemeStyleElement.rel = "stylesheet";
            document.head.appendChild(codeBlockThemeStyleElement);
        }
        codeBlockThemeStyleElement.href =
            baseUri + ("prism_themes/" + theme.codeBlockTheme + ".css");
        // Set editor theme
        var editorThemeStyleElementID = "vickymd-editor-theme";
        var editorThemeStyleElement = document.getElementById(editorThemeStyleElementID);
        if (!editorThemeStyleElement) {
            editorThemeStyleElement = document.createElement("link");
            editorThemeStyleElement.id = editorThemeStyleElementID;
            editorThemeStyleElement.rel = "stylesheet";
            document.head.appendChild(editorThemeStyleElement);
        }
        editorThemeStyleElement.href =
            baseUri + ("editor_themes/" + theme.editorTheme + ".css");
        if (editor) {
            var currentTheme = editor.getOption("theme");
            if (currentTheme !== theme.editorTheme) {
                editor.setOption("theme", theme.editorTheme);
                editor.refresh();
            }
        }
    }
    exports.setTheme = setTheme;
});
