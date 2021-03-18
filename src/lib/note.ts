export type FilePath = string;

export interface NoteConfigEncryption {
  title: string;
  // method: string;? // Default AES256
}

export interface NoteConfig {
  createdAt: Date;
  modifiedAt: Date;
  pinned?: boolean;
  favorited?: boolean;
  icon?: string;
  aliases?: string[];
}

export type Mentions = { [key: string]: boolean };

export interface Note {
  notebookPath: string;
  filePath: FilePath;
  title: string;
  markdown: string;
  config: NoteConfig;
  /**
   * @param key: mentioned note file path
   */
  mentions: Mentions;
}

export interface Notes {
  [key: string]: Note;
}

export function getNoteIcon(note: Note) {
  if (note.config.icon) {
    return note.config.icon;
  } else {
    return ":memo:";
  }
}
