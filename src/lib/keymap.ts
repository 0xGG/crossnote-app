export enum KeyMap {
  VIM = "vim",
  EMACS = "emacs",
  SUBLIME = "sublime",
  DEFAULT = SUBLIME,
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
