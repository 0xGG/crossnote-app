export type FilePath = string;

export interface NoteConfigEncryption {
  title: string;
  // method: string;? // Default AES256
}

export interface NoteConfig {
  createdAt: Date;
  modifiedAt: Date;
  title: string;
  pinned?: boolean;
  favorited?: boolean;
}

export interface Note {
  notebookPath: string;
  filePath: FilePath;
  markdown: string;
  config: NoteConfig;
  mentions: Notes;
  mentionedBy: Notes;
}

export interface Notes {
  [key: string]: Note;
}
