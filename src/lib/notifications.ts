// The transient messages the app shows in a corner: the git dialogs, the note
// title box and the image widget all report outcomes this way. It is a module
// rather than a React context on purpose. The editor widgets render through
// their own React roots outside the main tree, so a context could not reach
// them, while a module can be imported from anywhere.
//
// Messages show one at a time, in the order they were raised. A message stays
// until its own duration runs out or the user closes it, and the next one
// comes up only after the previous one has finished leaving.

export type NotificationSeverity = "error" | "info" | "success" | "warning";

export interface Notification {
  readonly id: number;
  readonly severity: NotificationSeverity;
  readonly message: string;
  /** Milliseconds before the message hides on its own. */
  readonly duration: number;
}

export interface NotificationState {
  /** The message at the head of the queue: on screen, or on its way out. */
  readonly current: Notification | null;
  /** False from the moment the current message starts leaving. */
  readonly open: boolean;
}

const DEFAULT_NOTIFICATION_DURATION = 2000;

const IDLE: NotificationState = { current: null, open: false };

const queue: Notification[] = [];
let state: NotificationState = IDLE;
let nextId = 1;
const listeners = new Set<() => void>();

function setState(next: NotificationState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function notify(input: {
  severity: NotificationSeverity;
  message: string;
  duration?: number;
}): void {
  queue.push({
    id: nextId++,
    severity: input.severity,
    message: input.message,
    duration: input.duration ?? DEFAULT_NOTIFICATION_DURATION,
  });
  if (!state.current) {
    setState({ current: queue[0], open: true });
  }
}

// Starts hiding the current message. The host calls this from every close
// path (the timer, the close button, Escape). The message leaves the queue
// only once its exit transition has ended, see dismissNotification.
export function closeNotification(): void {
  if (state.current && state.open) {
    setState({ current: state.current, open: false });
  }
}

// Drops the current message and brings up the next one, if any. Called when
// the exit transition has ended, so two messages never overlap.
export function dismissNotification(): void {
  if (!state.current) {
    return;
  }
  queue.shift();
  setState(queue.length ? { current: queue[0], open: true } : IDLE);
}

export function getNotificationState(): NotificationState {
  return state;
}

export function subscribeToNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// For tests: forgets every queued message and every listener.
export function resetNotifications(): void {
  queue.length = 0;
  state = IDLE;
  listeners.clear();
}
