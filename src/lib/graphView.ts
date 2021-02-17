import hash from "object-hash";
import { Notebook } from "./notebook";
export interface GraphViewNode {
  id: string;
  label: string;
}

export interface GraphViewLink {
  source: string;
  target: string;
}

export interface GraphViewData {
  hash: string;
  nodes: GraphViewNode[];
  links: GraphViewLink[];
}

export function constructGraphView(notebook: Notebook): GraphViewData {
  const nodes: GraphViewNode[] = [];
  const links: GraphViewLink[] = [];

  for (let filePath in notebook.notes) {
    const note = notebook.notes[filePath];
    nodes.push({
      id: note.filePath,
      label: note.config.title,
    });

    for (let mentionedFilePath in note.mentions) {
      const mentionedNote = note.mentions[mentionedFilePath];
      links.push({
        source: note.filePath,
        target: mentionedNote.filePath,
      });
    }
  }
  return {
    hash: hash({ nodes, links }),
    nodes,
    links,
  };
}
