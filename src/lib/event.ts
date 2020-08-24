import { NoteConfig } from "./notebook";

export enum EventType {
  ModifiedMarkdown = "ModifiedMarkdown",
  RefreshNotes = "RefreshNotes",
}

export interface ModifiedMarkdownEventData {
  tabId: string;
  noteFilePath: string;
  markdown: string;
  noteConfig: NoteConfig;
}

export interface RefreshNotesEventData {
  notebookPath: string;
}

export type EventData = ModifiedMarkdownEventData | RefreshNotesEventData;

export type EventCallback = (data: any) => void;

export class Emitter {
  private subscriptions: { [key: string]: EventCallback[] } = {};
  constructor() {
    this.subscriptions = {};
  }

  public on(eventName: EventType, cb: EventCallback) {
    if (eventName in this.subscriptions) {
      this.subscriptions[eventName].push(cb);
    } else {
      this.subscriptions[eventName] = [cb];
    }
  }

  public off(eventName: EventType, cb: EventCallback) {
    const eventCallbacks = this.subscriptions[eventName] || [];
    const index = eventCallbacks.findIndex((x) => x === cb);
    if (index >= 0) {
      eventCallbacks.splice(index, 1);
    }
  }

  public emit(eventName: EventType, data: EventData) {
    const eventCallbacks = this.subscriptions[eventName] || [];
    eventCallbacks.forEach((callback) => {
      callback(data);
    });
  }
}

export const globalEmitter = new Emitter();
