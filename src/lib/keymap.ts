export enum KeyMap {
  "DEFAULT" = "hypermd",
  "VIM" = "vim",
  "EMACS" = "emacs",
}

export function getKeyMap(v: string): KeyMap {
  if (v === "hypermd") {
    return KeyMap.DEFAULT;
  } else if (v === "vim") {
    return KeyMap.VIM;
  } else if (v === "emacs") {
    return KeyMap.EMACS;
  } else {
    return KeyMap.DEFAULT;
  }
}
