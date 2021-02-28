export enum KeyMap {
  "DEFAULT" = "sublime",
  "VIM" = "vim",
  "EMACS" = "emacs",
  "SUBLIME" = "sublime",
}

export function getKeyMap(v: string): KeyMap {
  if (v === "hypermd") {
    return KeyMap.SUBLIME;
  } else if (v === "vim") {
    return KeyMap.VIM;
  } else if (v === "emacs") {
    return KeyMap.EMACS;
  } else {
    return KeyMap.SUBLIME;
  }
}
