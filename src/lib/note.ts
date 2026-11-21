import i18next from "i18next";

export type FilePath = string;

export class NoteMovedError extends Error {}

export function renameFailureMessage(error: unknown): string {
  return error instanceof NoteMovedError
    ? error.message
    : i18next.t("error/failed-to-change-file-path");
}

export interface NoteConfigEncryption {
  title: string;
  // method: string;? // Default AES256
}

export interface NoteConfig {
  createdAt: Date;
  modifiedAt: Date;
  pinned?: boolean;
  favorited?: boolean;
  aliases?: string[];
}

export type Mentions = { [key: string]: boolean };

export interface Note {
  notebookPath: string;
  filePath: FilePath;
  title: string;
  markdown: string;
  // First line ending in the full file, including a stripped settings block.
  lineBreak?: string;
  config: NoteConfig;
  /**
   * @param key: mentioned note file path
   */
  mentions: Mentions;
}

export interface Notes {
  [key: string]: Note;
}
