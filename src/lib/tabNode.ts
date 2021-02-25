import { Note } from "./note";
import { Notebook } from "./notebook";

export type TabNodeComponent =
  | "Settings"
  | "Note"
  | "Notes"
  | "Privacy"
  | "Graph"
  | "Notifications";

export interface TabNodeConfig {
  singleton: boolean;
  note?: Note;
  notebook?: Notebook;
}

export interface CrossnoteTabNode {
  type: "tab";
  name: string;
  component: TabNodeComponent;
  config: TabNodeConfig;
  id?: string;
}

export const TabHeight = 24;
