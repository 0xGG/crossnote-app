import { Note } from "./note";
import { Notebook } from "./notebook";
import { Reference } from "./reference";

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
  reference?: Reference;
}

export interface CrossnoteTabNode {
  type: "tab";
  name: string;
  component: TabNodeComponent;
  config: TabNodeConfig;
  id?: string;
}

export const TabHeight = 24;
